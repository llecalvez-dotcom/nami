# Ticket 20: one H session per trip, and voice, typing or a tap at every step

Human owner: Clément (reviews the PR, runs the real passes on the agent's Chrome). Nathan reviews the panel part.

Read first: docs/tests/2026-11-08-mesure-vitesse-visa.md (where the time goes, and the note about keeping one session open with idle_timeout_s and POST /sessions/{id}/messages), docs/tests/2026-11-08-pont-chromedriver-mort.md, lib/h-agent.ts, lib/local-bridge.ts (CHANNEL_REST_MS, bridge refresh before each session), lib/agent-stall.ts, lib/agent-preflight.ts, lib/paper-agent.ts, lib/flights-agent.ts, lib/hotels-agent.ts, app/api/papers/start/route.ts, app/api/flights/start/route.ts, app/api/hotels/start/route.ts, components/trip/use-agent-run.ts, components/trip/use-trip-actions.ts, components/panel/focus-stage.tsx (Answering, Resting, TypeInstead, WaveMic), components/panel/panel-screen.tsx, lib/voice/auto-listen.ts.

## Part A: one H session for the whole trip

Why: today the visa, the arrival card, the flight and the hotel each create a new H session. Before each one, Nami restarts the holo local browser bridge and waits up to 35 s (CHANNEL_REST_MS), because a session created too soon after the previous one never gets the browser; the bridge has taken up to 55 s to come back. H's own per-step time (2 to 3 s) is the floor; this waiting is ours.

What to build:
1. Spike first. Write scripts/session-continue.mjs: create one H session with a long idle_timeout_s, run a short task (open about:blank then the e-VOA home, report_ready), then send a second task with POST /sessions/{id}/messages (open Google Flights, report_ready) through the local bridge. Log the time between the two tasks and whether the second one gets the browser. Write the result in docs/tests/20-session-continue.md. If H or the local bridge does not support it, stop Part A, say so in the PR, and do only Part B.
2. If the spike works: a trip keeps one H session (session_id, opened_at, last_task_at), stored server-side next to the existing registries. The visa starts it; the arrival card, the flight and the hotel send their task as a new message to the same session. No bridge restart and no CHANNEL_REST_MS wait between tasks of the same session.
3. Each task keeps its own rules: domain guard, forbidden buttons, stop condition and report_ready stay per task. The guard is re-armed with the new task's domain when its message is sent. A message never carries the previous task's permissions.
4. Fallback, never worse than today: if sending a message fails, the session is gone, or no step comes within the current stall thresholds, Nami ends that session and falls back to today's path (new session, bridge refresh, rest). Same status lines in the panel as today.
5. Stop agent still stops at once and ends the trip's session.
6. Keep the current per-task code. New path behind NAMI_H_SESSION_MODE=single (default); NAMI_H_SESSION_MODE=per_task restores today's behaviour. Add it to .env.example.

Tests: unit tests for the session registry (start, continue, fallback on error, stop, guard re-armed per task, no rule of the previous task kept); route tests showing /api/flights/start and /api/hotels/start continue an open session instead of creating one, and per_task mode unchanged. npm test, npm run lint, npx tsc --noEmit, npm run build all green.

Acceptance (real run on the bench): full voice run visa, arrival card, flight, timed with the scripts' -timing.json. The gap between the end of one task and the first step of the next is under 5 s (today 35 to 55 s). Same final result as today: visa stopped at step 1, arrival card stopped before Submit, flight on the booking page, nothing sent or paid. Numbers in docs/tests/20-session-continue.md.

## Part B: voice, typing or a tap, at every step

Why: the demo must never depend on the microphone. Today the text field only appears when a question has input "text", and the resting screen has no way to type.

What to build:
1. Every question offers the three ways, always: the mic on the wave, the suggestion buttons (item.options), and a "Type instead" field. A typed answer goes through the same path as a spoken one (onAnswerText): closed word lists first, then the intent model, never an invented click.
2. Proposals (yes / no) get the same: buttons, mic, and a text field ("ouais carrément" typed works like spoken).
3. A "Voice / Typing" switch in the panel header, next to the mute toggle, remembered in localStorage (wrapped in try/catch like the rest of the panel). In Typing mode the mic never opens by itself, the text field is shown first and focused, the suggestion buttons stay. In Voice mode, today's behaviour. Mute (Nami's voice) stays a separate control.
4. New texts go into the panel's translated texts. No em dash or en dash in UI texts.

Tests: a question without input "text" still shows the text field; a proposal answered by typing "yes sure" is accepted; in Typing mode the mic is not opened automatically; the mode survives a reload; a storage failure falls back to Voice.

Acceptance: on the bench, the full run done three ways (voice only, typing only, taps only), each reaching the same end.

## Out of scope
No change to what the agent does on the sites, no new country, no Gladia Live, no change to the stop-before-Submit rules.

## Rules
One branch, one PR to main, never merged by an agent, human review. No keys or real documents in the repo. Update docs/equipe/checklist.md and docs/onboarding/etat-et-suite.md.