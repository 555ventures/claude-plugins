# 0038. Approval by hash is the only provenance

- Status: accepted
- Date: 2026-11-03
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20261103/02-ceremony-nothing-reads.md)

## Context

ADR-0006 put a provenance ledger (`design/mocks/ledger.md`) in front of every design-command
advance: a product-kind claim that was invented or unconfirmed blocked the step. The audit in
specs/20261103/02-ceremony-nothing-reads.md found that every reader of the ledger was the
ledger machinery itself (its verbs, its gate, its confirm block, its counts line, the genesis
BRIEF precondition and a status line). Approving a journey already confirms its sentences by
hash, which is the proof that the client confirmed the story. The ledger was a second record of
the same fact, kept up by hand and read by nothing that decided anything.

## Options considered

- **Keep the gate** — the ledger stays and blocks each advance. Costs a write and a read per
  step for a verdict the hash approval already carries.
- **Reader-only parser** — delete the writer verbs, keep `lib/mocks-ledger.js` for the status
  line. A parser for a file nothing writes.
- **Delete it** — the ledger, its gate and every reader go; approval by hash stays.

## Decision

Approving a journey confirms its sentences by hash; no other provenance record is kept or
gated on. The ledger is deleted end to end. This is ADR-0006's rejected option C, taken with
the evidence that its gate protected nothing the approval did not.

## Consequences

- One fewer file to write, parse and keep in sync per design session.
- A `design/mocks/ledger.md` left on disk by an older run is never read.
- Nothing blocks an advance on an invented claim any more; the client's approval of the
  journey is the only check, and ADR-0006's reordering (design before genesis) is unchanged.

## Applies to

ADR-0006 — its Decision's sentence "The provenance ledger, not the session's judgment, gates
each advance" and its rejected option C are superseded; the rest of ADR-0006 stands. ADR-0006
itself is not edited.

## Dissents

Option C's own objection from ADR-0006, recorded verbatim: "relies on 'ask when unsure', which
the dry run showed never fires."
