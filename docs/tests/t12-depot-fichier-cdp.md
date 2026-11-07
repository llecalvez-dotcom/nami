# Ticket 12B: local CDP smoke test

Scope: the file handoff only, not a live H run or the real e-VOA form.

Run with Node.js 22+ and Chrome on PATH:

```sh
source ~/.nvm/nvm.sh
NAMI_CDP_SMOKE=1 npm test -- lib/agent-passport-upload.smoke.test.ts
```

The opt-in test starts its own headless Chrome and loopback HTTP server. Chrome
maps the official e-VOA host to that local server using a test-only host resolver
flag. The application domain check is unchanged. No external website, H session,
real passport, or OS file picker is used.

The fixture is a fictitious .jpg file, not a valid passport image, in a temporary document directory. The
normal document search supplies its opaque ID, which is bound to a test session.
The production upload function connects to that Chrome using native WebSocket
CDP, selects the official-host tab, and sets the file input.

Result on the development machine (Node.js 24.22.2):

```text
Test Files  1 passed (1)
     Tests  1 passed (1)
```

The page reported exactly one selected file, one input event and one change
event. This also checks that the fallback event dispatcher does not duplicate
Chrome's native events. Chrome and the HTTP server were stopped and fixtures
removed by the test.

Not verified: the H bridge on Nathan's Mac, actual e-VOA file validation, the
full H tool round trip, or visual Agent Activity. Use port 9333 on Nathan's Mac
if that is the port of his existing dedicated Chrome. The application never
starts Chrome; only this opt-in test does.
