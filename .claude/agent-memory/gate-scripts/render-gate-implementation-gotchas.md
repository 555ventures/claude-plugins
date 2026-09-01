---
name: render-gate-implementation-gotchas
description: Two non-obvious pitfalls hit building render-compare.js/render-gate.js (specs/20260824/01) — a bare negative test regex colliding with a locked summary literal (fix the probe, never the contract), and spawnSync starving an in-process HTTP server
metadata:
  type: feedback
  reviewed: 2026-08-31
---

Two implementation traps from building the render gate (specs/20260824/01-render-gate.md),
worth knowing before touching either script again or building a similar driver+HTTP-server
script elsewhere in this repo.

1. **A bare (unanchored) "did X happen" regex in a test can be tripped by an always-printed
   summary field carrying the same word.** `render-compare.test.js`'s dyRel/dataPositioned/
   positioning exclusion tests originally asserted `!/geometry/.test(stdout)` on a CLEAN run,
   while Contracts locks a summary field spelled `geometry=<n>` — so `geometry=0` tripped the
   negative probe. **The resolution was NOT to rename the summary key.** A locked Contracts
   literal is a machine contract downstream specs parse; a worker may not override it — that is a
   `blocked` return. The orchestrator ruled (specs/20260824/01 D18) that the summary keeps
   `geometry=<n>` and the three probes anchor on the finding-line form (`/^geometry /m`). General
   lesson: when a negative probe collides with a positive literal, fix the PROBE's precision, not
   the contract's spelling — and when the spec pins both sides of the collision, return `blocked`
   rather than picking one.

2. **`spawnSync` in the same process as an in-process HTTP server starves that server for the
   child's entire lifetime.** `render-gate.js` runs a Node `http` server (D8, serves the host's
   `design/` dir on an ephemeral port) AND invokes the host's capture command as a subprocess.
   Using `spawnSync` for the capture calls blocks the whole event loop until the child exits —
   so when the capture child does its own `http.get()` back against our server (proving
   `../tokens.css` resolves), the request can never be serviced until spawnSync returns, and the
   child's own request timeout (short, e.g. 800ms) fires first. Symptom: fetch status comes back
   0 (connection/timeout failure) instead of 200, AND every capture call pays that timeout
   serially (a 24-capture AC-8 fixture measured ~11.7s before the fix, ~1.6s after). Fix: use
   async `spawn()` + a Promise wrapper for every capture invocation, never `spawnSync`, whenever
   the same process also owns a listening server the child may connect back to.

[[gate-scripts]]
