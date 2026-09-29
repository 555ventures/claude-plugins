# 0031. The walkthrough contract

- Status: accepted
- Date: 2026-09-29
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260929/01-the-walkthrough-contract-and-the-client.md; the
  running prototype recorded in docs/spikes/20260929-walkthrough/FINDINGS.md)
- Applies to: ADR-0030 — clause (f) amended: the plugin's scripted client and what it owns.
- Amended by: —

## Context

ADR-0030 (f) made the client's surface a hosted service and described the plugin's side as "a
scripted HTTP client with four calls and a pinned API version". Its corrections section, ratified
on 2026-09-29, already recorded that the service is optional per project and that the client has
seven calls, and deferred the detail to this record. A running prototype of the service then
showed what a production contract still lacked: one file both repositories test against, one
error shape, incremental pulls, limits and a checksum, and a written version rule. It also showed
that a service whose data is reset must never be able to renumber rounds under files git already
holds.

## Decision

- **Seven calls, not four.** The client greets the service (`hello`), pushes a round
  (`pushRound`), uploads a picture (`putImage`), pulls notes (`pullNotes`), answers a note
  (`replyNote`), pulls approvals (`pullApprovals`) and marks a round (`markRound`). The reply
  call is what lets a session see what happened to a note; the image call keeps a picture round
  hidden until every picture has arrived.
- **The plugin owns the round number.** A push names its round: one past the highest numbered
  folder under `design/rounds/`, or the number the caller gives. The service refuses a round it
  already holds; a repeated push of identical content (same content hash) is a success.
- **The service is optional per project.** A host that declares no `walkthrough` config block
  (`baseUrl`, `project`, `tokenEnv`) sends nothing, writes nothing and exits 0. The token is
  read from the named environment variable at call time and is never printed or written.
- **The contract and the vocabulary live in the plugin.** `spec-paths walkthrough-contract` is
  the one machine-readable contract (calls, one error shape, limits, the version rule, examples)
  and `spec-paths walkthrough-catalog` is the gray wireframe vocabulary (19 components, one
  action). Both are plain JSON in a fixed subset of JSON Schema, read by a validator that fails
  closed on any other keyword, so a session checks a round offline before it sends it and the
  service can test against the same file with a standard library.
- **Versions.** Inside `/v1` only additive changes ship, each raising `revision`; a breaking
  change ships as `/v2` with `/v1` served beside it for at least 90 days. The client checks the
  service's `apiVersion` and `revision` before every call that changes or reads project data.

## Consequences

- `spec-paths walkthrough` is the one script behind which the network dependency sits; every
  answer is checked against the contract before a file is written, so a drifting service fails
  loudly rather than corrupting `design/rounds/`.
- The service's repository owes the content hash, the cursor, the checksum header, `sunset` and
  `revision`; the prototype has none of the five. Until the service conforms, the client stands
  on its stub.
- `/spec:mocks` and the npm reviewer are unchanged by this record; switching them is later work
  of brief 29.

## Applies to

- ADR-0030 — clause (f): "four calls" reads "seven calls"; the round number, the optional
  block, and the two contract files are as above.
