"use client";

import { useState } from "react";
import { filePaths, readAgentSettings } from "@/components/trip/agent-settings";
import { cancelAgent, rawToolReq, sendAgentAnswer, sendFlightChoice } from "@/components/trip/use-agent-run";
import { flightsStartBody, FLIGHTS_RETRY_PROPOSAL, isChoiceQuestion, isCriterionQuestion, pendingFlightChoice, startFlightsSession } from "@/lib/flights/flow";
import { googleFlightsUrl } from "@/lib/flights-agent";
import type { PassportFields } from "@/lib/contracts";
import { createVisaStartAttempt } from "@/lib/paper-start-client";
import { missingPassportMessage } from "@/lib/passport-reminder";
import { requestTripParse } from "@/lib/trip-parse-client";
import {
  answerAgentQuestion,
  answerQuestion,
  answerQuestionWithText,
  decideProposal,
  isAgentActive,
  pushAgentMessage,
  pushProposal,
  reopenAgentQuestion,
  startVisaRun,
  stopAgent,
  type Trip,
} from "@/lib/trip-state";
import { getTrip, saveTrip } from "@/lib/trip-store";

// An empty local session lets the server use NAMI_LOCAL_SESSION_ID (the side panel shows no settings).
// photoDocumentId: the ID photo confirmed in the side panel, resolved on the server like the passport (ticket 16).
// returnTicketDocumentId: the PDF return ticket confirmed the same way (ticket 17).
async function startVisaSession(
  trip: Trip,
  passport: PassportFields,
  documentId: string | null,
  photoDocumentId: string | null,
  paperId: "evoa" | "arrival_card" = "evoa",
  returnTicketDocumentId: string | null = null,
): Promise<string> {
  const settings = readAgentSettings();
  const attempt = createVisaStartAttempt({
    request: trip.request,
    passport,
    paper_id: paperId,
    local_session_id: settings.local_session_id.trim(),
    file_paths: filePaths(settings.files),
    ...(documentId ? { document_id: documentId } : {}),
    // The server binds the photo to the session together with the passport document only.
    ...(documentId && photoDocumentId ? { photo_document_id: photoDocumentId } : {}),
    ...(documentId && returnTicketDocumentId ? { return_ticket_document_id: returnTicketDocumentId } : {}),
  }, { scope: trip.id });
  return attempt();
}

// Module Vol: the Google Flights session, from the request only (no passport, no name, no e-mail).
async function startFlightsSessionRequest(trip: Trip): Promise<{ sessionId: string; url: string }> {
  const body = flightsStartBody(trip);
  if (!body) throw new Error("I need your departure and return dates to search flights.");
  const settings = readAgentSettings();
  const response = await fetch("/api/flights/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, local_session_id: settings.local_session_id.trim(), idempotency_key: crypto.randomUUID() }),
  });
  const json = (await response.json().catch(() => null)) as { session_id?: string; error?: string } | null;
  if (!response.ok || !json?.session_id) throw new Error(json?.error ?? `Request failed (${response.status})`);
  return { sessionId: json.session_id, url: googleFlightsUrl(body) };
}

async function discover(url: string, pick: (json: Record<string, unknown>) => boolean): Promise<boolean> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok && pick(await response.json());
  } catch {
    return false;
  }
}

// The conversation handlers shared by the Trip screen and the side panel (/panel).
export function useTripActions({
  trip,
  passport,
  documentId,
  photoDocumentId = null,
  returnTicketDocumentId = null,
  onNeedPassport,
  onStarted,
}: {
  trip: Trip | null;
  passport: PassportFields | null;
  documentId: string | null;
  photoDocumentId?: string | null;
  returnTicketDocumentId?: string | null;
  // documentsAvailable: the local document search can look for the passport.
  onNeedPassport: (documentsAvailable: boolean) => void;
  onStarted?: (trip: Trip) => void;
}) {
  const [starting, setStarting] = useState(false);
  const update = (next: Trip) => saveTrip(next);
  const latest = () => (trip ? getTrip(trip.id) ?? trip : null);

  // confirmed: what the side panel confirmed in this very event, before the next render carries it.
  // paperId: the e-VOA, or the arrival card that comes after it (same passport, same tab).
  const createVisa = async (
    itemId: string,
    confirmed?: { passport: PassportFields; documentId: string | null; photoDocumentId?: string | null; returnTicketDocumentId?: string | null },
    paperId: "evoa" | "arrival_card" = "evoa",
  ) => {
    const current = latest();
    const fields = confirmed?.passport ?? passport;
    const passportDocument = confirmed ? confirmed.documentId : documentId;
    if (starting || !current) return;
    if (!fields) {
      const documentsAvailable = await discover("/api/documents/find", (json) => json.enabled === true);
      const readerAvailable = await discover("/api/documents/extract", (json) => json.reader === "h" || json.reader === "anthropic");
      const reminder = missingPassportMessage(readerAvailable, documentsAvailable);
      const now = latest() ?? current;
      const lastMessage = [...now.conversation].reverse().find((item) => item.kind === "agent");
      if (lastMessage?.text !== reminder) update(pushAgentMessage(now, reminder));
      onNeedPassport(documentsAvailable);
      return;
    }
    setStarting(true);
    try {
      const sessionId = await startVisaSession(
        current, fields, passportDocument, confirmed?.photoDocumentId ?? photoDocumentId, paperId, confirmed?.returnTicketDocumentId ?? returnTicketDocumentId,
      );
      const started = startVisaRun(latest() ?? current, itemId, sessionId, new Date(), passportDocument !== null);
      update(started);
      onStarted?.(started);
    } catch (error) {
      update(pushAgentMessage(latest() ?? current, (error as Error).message));
    } finally {
      setStarting(false);
    }
  };

  const decide = (itemId: string, accepted: boolean) => {
    const current = latest();
    if (!current) return;
    const item = current.conversation.find((i) => i.id === itemId);
    if (accepted && !current.sample && item?.kind === "proposal" && item.action === "create_visa") return void createVisa(itemId);
    if (accepted && !current.sample && item?.kind === "proposal" && item.action === "create_arrival_card") {
      return void createVisa(itemId, undefined, "arrival_card");
    }
    update(decideProposal(current, itemId, accepted, new Date()));
  };

  // After the criterion, the flight search starts; after the choice, it goes to the agent that waits for it.
  const startFlightsRun = async () => {
    const current = latest();
    if (!current || starting || current.sample || isAgentActive(current.agent_run)) return;
    setStarting(true);
    try {
      const { sessionId, url } = await startFlightsSessionRequest(current);
      const started = startFlightsSession(latest() ?? current, sessionId, url, new Date());
      update(started);
      onStarted?.(started);
    } catch (error) {
      const now = latest() ?? current;
      update(pushProposal(pushAgentMessage(now, (error as Error).message), FLIGHTS_RETRY_PROPOSAL.action, FLIGHTS_RETRY_PROPOSAL.text, FLIGHTS_RETRY_PROPOSAL.accept_label, FLIGHTS_RETRY_PROPOSAL.decline_label));
    } finally {
      setStarting(false);
    }
  };

  const sendChoice = async () => {
    const current = latest();
    const choice = current ? pendingFlightChoice(current) : null;
    if (!current?.agent_run || !choice) return;
    try {
      await sendFlightChoice(current.agent_run.session_id, choice.tool_req, choice.flight);
    } catch (error) {
      const now = latest() ?? current;
      update(pushAgentMessage(now, `Your choice could not be sent to the agent: ${(error as Error).message}`));
    }
  };

  const answer = (itemId: string, value: string, label: string) => {
    const current = latest();
    if (!current) return;
    const item = current.conversation.find((i) => i.id === itemId);
    update(answerQuestion(current, itemId, value, label));
    if (isCriterionQuestion(item)) void startFlightsRun();
    if (isChoiceQuestion(item)) void sendChoice();
  };

  const answerWithText = async (itemId: string, text: string) => {
    const current = latest();
    if (!current) return;
    const item = current.conversation.find((i) => i.id === itemId);
    const { request } = await requestTripParse({
      transcript: text,
      current_request: current.request,
      question: item?.kind === "question" ? item.question : undefined,
    });
    update(answerQuestionWithText(latest() ?? current, itemId, text, request));
  };

  const answerAgent = async (itemId: string, value: string) => {
    const current = latest();
    if (!current) return;
    const answered = answerAgentQuestion(current, itemId, value);
    const item = current.conversation.find((i) => i.id === itemId);
    if (answered === current || item?.kind !== "agent_question" || !current.agent_run) return;
    update(answered);
    try {
      await sendAgentAnswer(current.agent_run.session_id, rawToolReq(current.agent_run.session_id, item.tool_req), value);
    } catch {
      const now = latest();
      if (now) update(reopenAgentQuestion(now, itemId));
    }
  };

  const stop = async () => {
    const current = latest();
    if (!current) return;
    if (!current.sample && current.agent_run) {
      try {
        await cancelAgent(current.agent_run.session_id);
      } catch (error) {
        update(pushAgentMessage(latest() ?? current, `${(error as Error).message} Run holo local stop in a terminal to stop it.`));
        return;
      }
    }
    update(stopAgent(latest() ?? current));
  };

  return { starting, createVisa, decide, answer, answerWithText, answerAgent, stop, startFlightsRun };
}
