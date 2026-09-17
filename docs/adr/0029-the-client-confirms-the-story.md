# 0029. The client confirms the story

- Status: accepted
- Date: 2026-09-17
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260917/01-the-client-confirms-the-story.md)
- Applies to: ADR-0028 — narrowed: the state chain ADR-0028's Decision named
  (SEED → SHELL → SCREENS → THEME → CLIENT → APPROVED) drops CLIENT; the client's walk of the
  served app happens during SCREENS, not as its own state.
- Amended by: —

## Context

ADR-0028 made the mock app the product's own source and gave the mocks stage a five-state chain
with a CLIENT state between THEME and APPROVED. That state existed to let the client walk the
served app once the theme was picked. Ten rounds of discovery on specs/20260917/01 fixed a
narrower actor model than ADR-0028 had assumed: on the page the reviewer package serves there are
only two actors, the client and the AI session; the person running `/spec:mocks` never touches
that page at all — they work from the seed file, the driver's CLI, and its printed steps. Every
control ADR-0028's design implied for a third, on-page operator role — a screen-approve control, a
journey-approve control, a theme-pick control, a standalone component catalog page — has no one to
press it, because the only page role left besides the client is the AI session that already acts
through files and the CLI.

Once the operator role is off the served page, keeping a CLIENT state whose only content is "the
client walks the app" stops meaning anything: the client's walk now happens while SCREENS is still
drawing the journeys, since a drawn journey is walkable the moment `client open` can build a link
for it (`status.journeys[*].drawn` set). A state whose one job was "hold the walk" prints a step
with nothing left for it to do.

The other half of the actor model is what makes the client's confirmation trustworthy. The old
seed grammar was names and arrows; the client's own discovery sentences never reached the app, so
there was nothing for a client to confirm against except a screen's presence. specs/20260917/01
rewrites the seed as a numbered list of the client's own sentences (the beat grammar, `N. "sentence"
-> screen[@state]`), has SCREENS copy those sentences verbatim into `src/journeys.ts`, and binds the
client's one confirm control to a hash of the exact beats it displayed (`beatHash`, spec
doctrine/mocks.md § Mocks: Client Player). A seed edit changes the hash; the driver's `deriveState`
then treats the journey as unconfirmed again (spec doctrine/mocks.md § Mocks: State Machine) and
routes back to SCREENS, with no human re-typing anything. The confirm is only worth having because
it is a confirm against sentences, not against arrows.

## Options considered

- **A. Keep CLIENT as its own state and add the beat grammar underneath it.** Rejected: the state
  would still print a step whose only content is "walk the app," which the SCREENS loop already
  makes possible the moment a journey is drawn; keeping it duplicates a gate the chain no longer
  needs.
- **B. Drop CLIENT, and derive journey approval implicitly whenever `client open` has been called.**
  Rejected: "opened" is not "confirmed" — a client who opens the link and never answers must not be
  read as having approved the story. The chain still needs an explicit `client ok` / `client waive`
  verdict, just not a state that exists solely to sequence it.
- **C. Collapse the chain to SEED → SHELL → SCREENS → THEME → APPROVED, move the client's walk and
  confirm into the SCREENS loop (a journey is walkable, confirmable, and re-confirmable the moment
  it is drawn), and bind every confirm to `beatHash` of the seed's beats so an edited seed
  mechanically reopens it.** Adopted.

## Decision

**Option C.** The actor model: on the served page there are exactly two roles, the client and the
AI session; the person running `/spec:mocks` is neither — they read the seed file, run the driver's
CLI, and act on its printed steps (spec doctrine/mocks.md § Mocks: Client Player). No mark in the
mocks stage reads a key that only a non-client, non-file control writes, so a screen-approve
control, a journey-approve control apart from the client's own, a theme-pick control, and a
standalone component page are not built into the mock stage at all — the theme is picked by editing
`mock.config.ts` from the back, not from a page control.

The state chain drops CLIENT: **SEED → SHELL → SCREENS → THEME → APPROVED**
(spec doctrine/mocks.md § Mocks: State Machine). A journey's walk and its confirmation both happen
during SCREENS, from the moment `--mark journey-drawn` records it: `client open` builds that
journey's link, and the client's confirm (or an operator's `client waive --journey <j> --reason
<r>`) is recorded against it without a separate state to hold the wait. THEME prints two blocks
once entered — first a pick block while `marks.themePicked` is null, then, once picked, a close
block (`client open` for any journey still unconfirmed, then `--mark approved`) — so the chain's
last state carries the close-out bookkeeping the retired CLIENT state used to gate.

The confirmation is bound to the beat hash. A seed journey is a persona line followed by numbered
beats, each one the client's own sentence: `N. "sentence" -> screen[@state]`
(spec doctrine/mocks.md § Mocks: Seed). SCREENS copies those sentences verbatim into
`src/journeys.ts`; the driver proves the copy through `check --json`'s echoed steps, since it may
not read the journeys file directly. `beatHash(beats)` — the first 12 hex of a sha256 over the
canonical `beat -> screen[@state]` lines, joined by newline — is the one hash of a journey's story,
computed once in `spec/scripts/lib/surfaces.js` and shared by the driver and the served client page.
A journey records approved only when `approval.journeys[<j>].beats` equals the seed's current
`beatHash`; a client's confirmation of an earlier version of the story does not carry forward
silently, and an edited seed reopens the journey by hash mismatch alone, with no human re-typing a
verdict.

## Applies to

- **ADR-0028**'s Decision — narrowed. ADR-0028 named the chain
  "SEED → SHELL → SCREENS → THEME → CLIENT → APPROVED"; this record drops CLIENT, folding the
  client's walk and confirm into SCREENS and THEME as described above. Nothing else ADR-0028
  decided — the mock app as the product's own source, the reviewer as a separate package behind a
  versioned contract, the driver owning the state machine and the ledger — is touched.

## Consequences

- A reader of ADR-0028 who wants to know whether CLIENT still exists finds the `Amended by` line
  on that record and follows it here rather than trusting a chain the driver no longer derives.
- `deriveState()` never prints CLIENT again; a bare run past THEME's pick block goes straight to
  the close block, and past APPROVED there is nothing further to derive.
- A journey's confirmation is a claim about specific sentences, not about a screen's mere
  existence: `beatHash` is the one artifact that makes "the client confirmed the story" a checkable
  fact rather than a checkbox.
- Every later mock spec inherits this actor model: a served-page control with no client or session
  to press it is out of scope for the mocks stage by construction, not by a case-by-case veto.

## Dissents

None recorded. Option B (deriving approval implicitly from `client open`) was weighed and rejected
in the same round the actor model was fixed: an opened link is not a read confirmation, and the one
human gate this stage keeps is the client's explicit verdict against the hash, not a proxy for it.
