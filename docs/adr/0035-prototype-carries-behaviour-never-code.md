# 0035. Prototype carries behaviour, never code

- Status: accepted
- Date: 2026-10-07
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (docs/roadmap/28a-prototype-carries-behaviour-never-code.md;
  specs/20261007/01–03)
- Applies to: ADR-0030 — clause (d) amended (choosing `/spec:prototype` is choosing the
  behaviour lane; a brief's `Lane:` is advisory; a `proto/*` branch is the third kind at commit
  time), clause (h) replaced (no gate, no structural capture, no export, no deletion at approve),
  and the line "Discovery prototypes before a seed exists stay outside the pipeline" withdrawn.
- Amended by: —

## Context

Brief 28 built the prototype as a pipeline stage: a brief path with `Lane: behaviour` was
required, the freeze demanded the kit gates green, captured every route × state as a structural
tree, exported the data and API layer to `harden/<stem>` for the build to merge, generated the
spec, and deleted the worktree. On 2026-10-07 the command refused a host's first-light brief on
the lane label, and JJ ruled on how the prototype is actually used: a sketchpad — words, a
running throwaway app, reactions, repeat — from which nothing durable is written until approve,
and from which no code is ever copied into production. "I do not want you to just copy messy
codebase into production codebase, but architecturally sound, high quality code. You can keep
the worktree until this is done; it will be either roadmap or spec's responsibility to implement
the production grade codebase."

## Decision

- **Carry behaviour across, never code.** The prototype is a reference, never a source. Code
  moves from it only by being read and rewritten under a spec whose File Plan comes from the
  production architecture. ADR-0030 (h)'s export of the data and API layer is withdrawn: "a
  schema built twice is two products" is a price JJ accepts for sound production code.
- **Entry is plan's three shapes.** `/spec:prototype` takes words, a brief path or a stem; no
  brief is required and no lane header is read. The discovery-prototype exclusion is lifted.
- **Approve writes a contract.** Pins as sentences, one picture per route × state made by a
  command the host owns, one end-to-end test per behaviour pin that passed on the prototype.
  No gate on the prototype tree, no kit requirement, no generated spec.
- **Design is judged by eye.** The structural capture and its route-by-route diff gate are
  retired; the build's look stop shows the production screens beside the prototype's pictures.
- **The build replays the contract.** The contract's tests run against the production build as
  a blocking build state; review proves it through a `contract` leg read off the build row.
- **The worktree lives until the specs are done.** `proto/<stem>` is deleted when the last spec
  citing the stem closes, derived by `/spec:status` and run by the review driver — never at
  approve.

## Consequences

- The grounding contract's `prototype` block changed shape (`export`, `gate`, `storageState`
  gone; `e2eRun` and `picture` added; `{stem}` replaces `{brief}`), so hosts owe a
  `/spec:doctor` re-stamp.
- `harden/*` branches no longer exist; `/git:merge` keeps refusing `proto/*` and names the
  contract.
- A `proto/*` branch may outlive several specs; a stale one is a `/spec:status` hygiene item
  with its close paste.
- Folding the wireframe stage into the prototype stays parked until this has run on a host.

## Applies to

- ADR-0030 — clauses (d) and (h), and the discovery-prototype line.
- 28a-prototype-carries-behaviour-never-code — the brief this ADR records.
