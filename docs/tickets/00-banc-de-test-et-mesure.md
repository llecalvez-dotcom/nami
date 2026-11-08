# Ticket 0 : a test bench on Devin's machine, and a benchmark that proves v2 is faster and better
Human owner: Samy (reviews and merges into v2). Every later ticket (20, 22, 19, 21) opens its PR to v2 and must pass this bench before review.

Why
The new version (v2: one H session per trip, server orchestrator, replayed forms, validator) must be measured against today's main, not guessed. It must be testable on Devin's machine, without real documents and without filling real government forms with fake data. Today the repo has no automatic checks on PRs, and Devin's earlier PRs said "not tested in the UI: no H / Linkup keys".

Read first: CLAUDE.md, docs/onboarding/installation.md (sections 5 to 12), docs/tests/2026-11-08-mesure-vitesse-visa.md, docs/tests/f1-evoa.md, docs/tests/g1-vols.md, scripts/passage-evoa.mjs, scripts/passage-vol.mjs, scripts/passage-hotel.mjs, scripts/lancer-demo.sh, lib/bali-papers.ts, lib/official-sites.ts, lib/agent-changes.ts (offSite), lib/local-chrome.ts, lib/documents.ts.

Part A: automatic checks on every PR (GitHub Actions)
.github/workflows/ci.yml: on every PR to main or v2, run npm ci, npm test, npm run lint, npx tsc --noEmit, npm run build, on ubuntu-latest and windows-latest (the final target PC runs Windows). Node 22.
No secret needed for this job; tests that need a real key are skipped when the key is absent.
Part B: synthetic test documents
Add fixtures/test-documents/ and scripts/make-test-documents.py exactly as provided by Samy (three fictional SPECIMEN passports with valid ICAO 9303 MRZ check digits, their ID photos, manifest.json with the expected fields, a README). If they are not in the repo yet, ask Samy for them in the PR; do not create others from the internet.
Cases covered: French passport (Bali e-VOA, China), Chadian passport (Schengen tourist visa for France), passport expiring too soon (the 6-month rule must warn).
A test reads each passport through Nami's real reading path (H vision model when HAI_API_KEY is present, MRZ check always) and compares with manifest.json.
Rules: never use real documents on Devin's machine; never upload these files to a real government site.
Part C: local copies of the official forms (mock sites)
fixtures/sites/evoa/ and fixtures/sites/allindonesia/: static HTML + small JS copies of the steps the agent goes through, rebuilt from the real-run reports in docs/tests (do not scrape the real sites; build faithful mocks). They must reproduce the known traps:
e-VOA: 4 dependent dropdowns (country, General / Family / Social, Tourism / Family Visit / Transit, B1), "Detail & Apply" below the fold, the conditions window with "Apply", step 1 with passport upload that shows the site's reading in a window with "Reupload" and "Ok" (reached with Page Down), the country shown as "PRANCIS" for France, the whole name put in First Name, the Postal Code that fills Province / City / District / Village, Port of Entry "NGURAH RAI AIRPORT", the return ticket that accepts PDF only, a "Next" button and a final "Submit" that must never be clicked (the mock records any click on them as a failure).
All Indonesia arrival card: the form up to the page before Submit, with Submit recorded as a failure if clicked.
Served by Nami in test mode at http://evoa.test.localhost:3000/... and http://allindonesia.test.localhost:3000/... (or a separate tiny static server), enabled by NAMI_MOCK_SITES=on. In that mode, bali-papers and the domain guard use the mock hosts instead of the real ones. Off by default, impossible to enable when NODE_ENV=production.
Each mock writes a result file at the end of a run: fields filled, uploads received, step reached, forbidden clicks (must be 0).
Part D: the bench on Devin's machine
scripts/bench/setup.sh: install Chrome, start it with a remote debugging port and a dedicated profile, pip install "hai-agents[cli,browser]", start holo local browser on that port, start Nami with NAMI_MOCK_SITES=on, NAMI_DOCUMENTS_DIR=fixtures/test-documents, keys from the Devin organisation secrets (HAI_API_KEY, GLADIA_API_KEY, LINKUP_API_KEY). The Linux path of lib/local-bridge.ts must work (bridge restart is enabled on Linux).
scripts/bench/run.mjs <label> <runs>: for each run, a full trip typed (no microphone on the VM), through Nami's own routes like the panel does: trip sentence, passport confirmation, visa (mock), arrival card (mock), flight on the real Google Flights (public page, stops on the booking page, nothing booked), hotel on Google Hotels (prices page). Plus one voice check: two recorded audio files in fixtures/audio/ (French "Je pars à Bali lundi pour le mariage d'un ami", English "yes") sent to /api/voice/transcribe.
H budget: at most 3 full runs per PR (H has 3 session slots shared with the team). Wait for a free slot (GET /sessions/quota) instead of failing. Never leave a session running: end every session at the end of a run.
Part E: the benchmark report (the point of this ticket)
For each run, write bench/<label>/<run>.json and a summary table in the PR description:

Measure	How
Success	each task reached its expected end (mock result files, flight booking page, hotel prices) with 0 forbidden clicks
Time per task	from the traveller's "Go" / "yes" to the task's verified end
Dead time between tasks	end of one task to the first step of the next (today up to 35 to 55 s)
Total trip time	first sentence to last task done
H steps and H cost	per task, from the H session events
Questions asked to the traveller	count
Recoveries	automatic restarts, stalls, fallbacks
First, run the bench on the current main (label baseline, 3 runs) and commit the report in docs/tests/00-baseline.md. This is the number every v2 PR must beat or match.
From then on, every PR to v2 includes the same table for its branch, next to the baseline.
Out of scope
Changing Nami's behaviour (this ticket only adds tests, mocks, fixtures and the bench), real government sites, real documents, Windows-specific fixes (the CI job only reports them).

Acceptance
CI green on ubuntu; the windows job runs and its failures are listed in the PR (not fixed here).
docs/tests/00-baseline.md with 3 baseline runs on main: success, times, dead time, H steps, cost.
A forbidden click on a mock is detected and reported as a failure (shown by a test).
No real document, key or personal data in the repo, logs or PR.