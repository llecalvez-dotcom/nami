"use client";

import { useEffect, useState } from "react";
import { filePaths, readAgentSettings } from "@/components/trip/agent-settings";
import { cancelAgent, rawToolReq, sendAgentAnswer, sendFlightChoice, sendHotelChoice } from "@/components/trip/use-agent-run";
import { flightsAnswered, flightsStartBody, FLIGHTS_RETRY_PROPOSAL, isChoiceQuestion, isCriterionQuestion, knownTransitChecks, openFlightQuestion, pendingFlightChoice, pendingTransitChecks, recordTransitChecks, startFlightsSession } from "@/lib/flights/flow";
import { TransitCheckSchema, type TransitCheck, type TransitInput } from "@/lib/journey/transit";
import { googleFlightsUrl } from "@/lib/flights-agent";
import { googleHotelsUrl } from "@/lib/hotels-agent";
import { hotelsAnswered, hotelsStartBody, HOTELS_RETRY_PROPOSAL, isHotelChoiceQuestion, isHotelCriterionQuestion, openHotelQuestion, pendingHotelChoice, startHotelsSession } from "@/lib/hotels/flow";
import type { PassportFields } from "@/lib/contracts";
import { H_NOT_ANSWERING_MESSAGE } from "@/lib/agent-changes";
import { createVisaStartAttempt } from "@/lib/paper-start-client";
import { missingPassportMessage } from "@/lib/passport-reminder";
import { requestTripParse } from "@/lib/trip-parse-client";
import {
  answerAgentQuestion,
  answerQuestion,
  answerQuestionWithText,
  decideProposal,
  giveUpAutoRestart,
  isAgentActive,
  markAutoRestart,
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
  onBusy?: (message: string) => void,
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
  }, { scope: trip.id, onBusy });
  return attempt();
}

// Module Vol: the Google Flights session, from the request only (no passport, no name, no e-mail).
async function fetchTransit(input: TransitInput): Promise<TransitCheck> {
  const unverified = (error: string): TransitCheck => ({
    city: input.city, country_iso2: input.country_iso2 === "ZZ" ? null : input.country_iso2, country: input.city, connection: input.connection, layover_min: input.layover_min,
    status: "needs_verification", summary: `I could not check the transit rules for ${input.city} (${error}). Verify them on an official site before booking.`, sources: [], error,
  });
  if (input.country_iso2 === "ZZ") return unverified("unknown country");
  try {
    const response = await fetch("/api/transit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    if (!response.ok) return unverified(`search failed, ${response.status}`);
    const parsed = TransitCheckSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : unverified("unreadable answer");
  } catch (error) {
    return unverified((error as Error).message);
  }
}

async function startFlightsSessionRequest(trip: Trip, onBusy?: (message: string) => void): Promise<{ sessionId: string; url: string }> {
  const body = flightsStartBody(trip);
  if (!body) throw new Error("I need your departure city and your dates to search flights.");
  const settings = readAgentSettings();
  // Same attempt logic as a paper: after an answer that came too late, a new click reuses the key, so H cannot open a second session.
  const attempt = createVisaStartAttempt(
    { ...body, local_session_id: settings.local_session_id.trim() },
    { scope: `${trip.id}:flights`, onBusy, url: "/api/flights/start" },
  );
  return { sessionId: await attempt(), url: googleFlightsUrl(body) };
}

// Module Hôtel: the Google Hotels session, from the request only.
async function startHotelsSessionRequest(trip: Trip, onBusy?: (message: string) => void): Promise<{ sessionId: string; url: string }> {
  const body = hotelsStartBody(trip);
  if (!body) throw new Error("I need your dates to search hotels.");
  const attempt = createVisaStartAttempt(
    { ...body, local_session_id: readAgentSettings().local_session_id.trim() },
    { scope: `${trip.id}:hotels`, onBusy, url: "/api/hotels/start" },
  );
  return { sessionId: await attempt(), url: googleHotelsUrl(body) };
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
  // A start still waiting for a slow H (the server says "busy"): told once, in the conversation and aloud.
  const tellBusy = (message: string) => {
    const current = latest();
    if (!current) return;
    const lastMessage = current.conversation.findLast((item) => item.kind === "agent");
    if (lastMessage?.text !== message) update(pushAgentMessage(current, message));
  };

  // confirmed: what the side panel confirmed in this very event, before the next render carries it.
  // paperId: the e-VOA, or the arrival card that comes after it (same passport, same tab).
  // automatic: the one restart after H never started the session; a failure then says so and proposes a manual retry.
  const createVisa = async (
    itemId: string,
    confirmed?: { passport: PassportFields; documentId: string | null; photoDocumentId?: string | null; returnTicketDocumentId?: string | null },
    paperId: "evoa" | "arrival_card" = "evoa",
    automatic = false,
  ) => {
    const current = latest();
    const fields = confirmed?.passport ?? passport;
    const passportDocument = confirmed ? confirmed.documentId : documentId;
    if (starting || !current) return;
    if (!fields && automatic) return update(giveUpAutoRestart(current, paperId));
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
        current, fields, passportDocument, confirmed?.photoDocumentId ?? photoDocumentId, paperId, confirmed?.returnTicketDocumentId ?? returnTicketDocumentId, tellBusy,
      );
      const run = startVisaRun(latest() ?? current, itemId, sessionId, new Date(), passportDocument !== null, automatic);
      const started = automatic ? markAutoRestart(run, "done") : run;
      update(started);
      onStarted?.(started);
    } catch (error) {
      const now = latest() ?? current;
      update(automatic ? giveUpAutoRestart(now, paperId) : pushAgentMessage(now, (error as Error).message));
    } finally {
      setStarting(false);
    }
  };

  // After the criterion, the flight search starts; after the choice, it goes to the agent that waits for it.
  // automatic: the one restart after H never opened Google Flights, with the same dates, origin and criterion.
  const startFlightsRun = async (automatic = false) => {
    const current = latest();
    if (!current || starting || current.sample || isAgentActive(current.agent_run)) return;
    setStarting(true);
    try {
      const { sessionId, url } = await startFlightsSessionRequest(current, tellBusy);
      const run = startFlightsSession(latest() ?? current, sessionId, url, new Date());
      const started = automatic ? markAutoRestart(run, "done") : run;
      update(started);
      onStarted?.(started);
    } catch (error) {
      const now = latest() ?? current;
      const told = pushAgentMessage(automatic ? markAutoRestart(now, "failed") : now, automatic ? H_NOT_ANSWERING_MESSAGE : (error as Error).message);
      update(pushProposal(told, FLIGHTS_RETRY_PROPOSAL.action, FLIGHTS_RETRY_PROPOSAL.text, FLIGHTS_RETRY_PROPOSAL.accept_label, FLIGHTS_RETRY_PROPOSAL.decline_label));
    } finally {
      setStarting(false);
    }
  };

  const startHotelsRun = async (automatic = false) => {
    const current = latest();
    if (!current || starting || current.sample || isAgentActive(current.agent_run)) return;
    setStarting(true);
    try {
      const { sessionId, url } = await startHotelsSessionRequest(current, tellBusy);
      const run = startHotelsSession(latest() ?? current, sessionId, url, new Date());
      const started = automatic ? markAutoRestart(run, "done") : run;
      update(started);
      onStarted?.(started);
    } catch (error) {
      const now = latest() ?? current;
      const told = pushAgentMessage(automatic ? markAutoRestart(now, "failed") : now, automatic ? H_NOT_ANSWERING_MESSAGE : (error as Error).message);
      update(pushProposal(told, HOTELS_RETRY_PROPOSAL.action, HOTELS_RETRY_PROPOSAL.text, HOTELS_RETRY_PROPOSAL.accept_label, HOTELS_RETRY_PROPOSAL.decline_label));
    } finally {
      setStarting(false);
    }
  };

  // H opened the session and never acted (bench 2026-11-08): the same session starts again once, by itself, with the
  // same paper, documents, dates and criterion. Nothing is asked again; the status line says "H is slow, starting again".
  const dueRestart = trip?.agent_run?.auto_restart === "due" ? trip.agent_run.session_id : null;
  useEffect(() => {
    if (!dueRestart || starting) return;
    // On the next tick: the start sets state, which an effect must not do synchronously.
    const timer = setTimeout(() => {
      const current = latest();
      const run = current?.agent_run;
      if (!current || !run || run.session_id !== dueRestart || run.auto_restart !== "due" || current.sample) return;
      update(markAutoRestart(current, "taken"));
      if (run.kind === "flights") return void startFlightsRun(true);
      if (run.kind === "hotels") return void startHotelsRun(true);
      const paperId = run.paper_id ?? "evoa";
      const action = paperId === "arrival_card" ? "create_arrival_card" : "create_visa";
      const item = current.conversation.findLast((i) => i.kind === "proposal" && i.action === action && i.decision === "accepted");
      if (item) void createVisa(item.id, undefined, paperId, true);
      else update(giveUpAutoRestart(getTrip(current.id) ?? current, paperId));
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueRestart, starting]);

  const decide = (itemId: string, accepted: boolean) => {
    const current = latest();
    if (!current) return;
    const item = current.conversation.find((i) => i.id === itemId);
    if (accepted && !current.sample && item?.kind === "proposal" && item.action === "create_visa") return void createVisa(itemId);
    if (accepted && !current.sample && item?.kind === "proposal" && item.action === "create_arrival_card") {
      return void createVisa(itemId, undefined, "arrival_card");
    }
    const next = decideProposal(current, itemId, accepted, new Date());
    update(next);
    // "Search again" (or yes to the flights) with the city, the dates and the criterion already answered: no question
    // again, the Google Flights session starts now with the same parameters (lib/flights/flow.ts, startFlightsFlow).
    if (accepted && item?.kind === "proposal" && item.action === "flights" && flightsAnswered(next)) void startFlightsRun();
    if (accepted && item?.kind === "proposal" && item.action === "hotels" && hotelsAnswered(next)) void startHotelsRun();
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

  // The transit rules of the stops abroad of the chosen flight: one /api/transit call per stop, official sites only;
  // a failed call is "needs verification", never a guess (lib/journey/transit.ts).
  const checkTransit = async () => {
    const current = latest();
    const pending = current ? pendingTransitChecks(current) : null;
    if (!current || !pending) return;
    const known = knownTransitChecks(current);
    const checks = await Promise.all(pending.map((input) => known.find((k) => k.city === input.city) ?? fetchTransit(input)));
    const now = latest() ?? current;
    if (!pendingTransitChecks(now)) return;
    update(recordTransitChecks(now, checks));
  };

  const sendHotel = async () => {
    const current = latest();
    const choice = current ? pendingHotelChoice(current) : null;
    if (!current?.agent_run || !choice) return;
    try {
      await sendHotelChoice(current.agent_run.session_id, choice.tool_req, choice.hotel);
    } catch (error) {
      update(pushAgentMessage(latest() ?? current, `Your choice could not be sent to the agent: ${(error as Error).message}`));
    }
  };

  // Spoken or tapped, the same follow-up: the search once the criterion is settled, the choice once a flight is.
  const followFlights = (item: Trip["conversation"][number] | undefined, next: Trip) => {
    if (isCriterionQuestion(item) && !openFlightQuestion(next, "flight_criterion")) void startFlightsRun();
    if (isChoiceQuestion(item) && pendingFlightChoice(next)) void sendChoice();
    if (isChoiceQuestion(item) && pendingTransitChecks(next)) void checkTransit();
    if (isHotelCriterionQuestion(item) && !openHotelQuestion(next, "hotel_criterion")) void startHotelsRun();
    if (isHotelChoiceQuestion(item) && pendingHotelChoice(next)) void sendHotel();
  };

  const answer = (itemId: string, value: string, label: string) => {
    const current = latest();
    if (!current) return;
    const item = current.conversation.find((i) => i.id === itemId);
    const next = answerQuestion(current, itemId, value, label);
    update(next);
    followFlights(item, next);
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
    const next = answerQuestionWithText(latest() ?? current, itemId, text, request);
    update(next);
    followFlights(item, next);
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
