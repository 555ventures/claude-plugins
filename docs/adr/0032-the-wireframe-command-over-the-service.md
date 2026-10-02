# 0032. The wireframe command over the service

- Status: accepted
- Date: 2026-10-02
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20261002/01-the-wireframe-command-runs-over-the-service.md)
- Applies to: ADR-0029 — the confirm gate has a terminal form and a waiver; ADR-0030 — clause (f)
  amended: the mocks command is the plugin's client of the service.
- Amended by: —

## Context

ADR-0031 gave the plugin a scripted client for the walkthrough service and left the mocks command
unchanged. The command still drove a mock app, a shell step, a theme step and a screen-approval
record, none of which a gray wireframe needs. Three rulings of 2026-10-02 close that gap.

## Decision

- **Three states.** The mocks stage runs `SEED → SCREENS → APPROVED`. The shell and theme steps
  do not exist; colours and the shared layout belong to the design stage (ADR-0030 g).
- **A project without the service confirms in the terminal.** A host with no `walkthrough`
  config block draws nothing and sends nothing; the client confirms each story in the terminal.
  With the block, a journey is confirmed on the service against the hash of its sentences, and
  may also be waived with a written reason. This amends ADR-0029's one confirm gate.
- **The stage finishes on confirmed stories.** It is done when every story is confirmed and no
  note waits for an answer; an answered note does not block. The last round is then closed.

## Consequences

- Genesis reads its counts from the seed and the latest round, not from a mock app's files.
- The old reviewer package, its contract file, the mock-app templates and the spec-paths
  mock-contract key are removed.
- Picture rounds stay out of scope until the service accepts them.

## Applies to

- ADR-0029 — the client's confirm is still the one gate, with a terminal form and a waiver.
- ADR-0030 — clause (f): the mocks command runs over the service through `walkthrough.js`.
