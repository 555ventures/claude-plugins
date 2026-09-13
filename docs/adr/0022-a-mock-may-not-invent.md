# 0022. A mock may not invent

- Status: accepted
- Date: 2026-09-13
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260912/09-a-mock-may-not-invent.md)
- Applies to: specs/20260824/03-mock-states-hygiene.md D1's hygiene check (a) — "a universal
  `box-sizing: border-box` rule exists in the file's own `<style>`" is narrowed: the check is
  also satisfied when the mock links the wire register instead of carrying its own `<style>`
  reset, because `design/wire/wire.css` already declares that rule. The own-`<style>` route
  stays for a mock that does not link the register. Nothing else in D1's four checks changes.
  docs/adr/0013-client-rehearses-the-journey.md — the authoring rules for a labelled mock that
  links the wire register gain the invention bar this record's Decision states in full.
- Amended by: —

## Context

specs/20260912/09-a-mock-may-not-invent.md measured nine screens carrying 18 shared-kit classes,
30 project classes and 50 more invented inside per-screen `<style>` blocks: 21 of those classes
appeared on exactly one screen, 16 names were defined in two or three layers at once, and `.btn`
resolved to six different heights depending on its ancestor. Nothing refused any of that — the
project's own stylesheet had no defined home, so each project invented one
(`design/wire/hearwell.css`) and nothing could be checked against it.

specs/20260824/03-mock-states-hygiene.md's D1 hygiene check (a) requires a universal
`box-sizing: border-box` rule inside the mock's own `<style>` block. specs/20260912/09's D3
removes the only place check (a) could previously look: a bound mock may no longer carry a
`<style>` block that declares a rule at all (an `@import`-only block is still permitted). Read
literally, a mock that correctly externalises every rule into the wire register would fail a
hygiene check it satisfies in substance, because `design/wire/wire.css` — the file it links —
already carries that reset. Narrowing check (a) is an amendment to a locked spec's own Decision,
not a silent edit, per the roadmap-amendment convention this repo already follows for ADR-0017
and ADR-0021.

Separately, ADR-0013 fixed the client's rehearsal surface and, among other things, the
authoring rules a labelled mock following it must obey. It says nothing about where a mock's
CSS may live or how much of it a project may invent, because specs/20260912/09 is the record
that first draws that line. ADR-0013 gains the matching backlink so a reader of its authoring
rules is pointed at the invention bar rather than finding it absent.

## Options considered

- **A. Leave hygiene check (a) as written and give a bound mock a `<style>` block containing
  only the `border-box` reset as a second permitted exception alongside `@import`.** Rejected:
  this reintroduces exactly the per-screen `<style>` block D3 exists to remove, and a reset
  written by hand on nine screens is itself six chances to get it wrong rather than one register
  file that already got it right.
- **B. Rewrite specs/20260824/03's D1 text in place to describe the new satisfying route, with
  no `Applies to`/`Amended by` backlink.** Rejected: specs/20260824/03 is a locked, hardened
  spec whose Decisions table workers apply verbatim; rewriting it without a trace erases the
  fact that a locked ruling changed, the failure the amendment convention exists to prevent.
- **C. A new amendment ADR narrows hygiene check (a) by backlink and gains ADR-0013's matching
  backlink for the invention bar; specs/20260824/03's own Decisions table is not edited.**
  Adopted.

## Decision

**Option C.** specs/20260824/03-mock-states-hygiene.md D1's hygiene check (a) is narrowed:
it is satisfied for a bound mock either by the mock's own `<style>` block declaring a universal
`box-sizing: border-box` rule (the original route, still available to a mock that does not link
the wire register) or by the mock linking `design/wire/wire.css`, which declares that rule for
every mock that links it. A mock linking neither the register nor carrying its own reset
continues to fail check (a) exactly as before. No other clause of D1 — (b) declared
`line-height`, (c) no `border`/`border-radius` on the labelled root, (d) state-control placement
— is touched by this record or by specs/20260912/09.

**ADR-0013's authoring rules gain the invention bar.** A labelled, non-canon mock that links the
wire register links only `design/wire/tokens.css`, `design/wire/wire.css` and, when the project
has one, `design/wire/project.css`; carries no `<style>` block that declares a rule (an
`@import`-only block is permitted) and no `style=` attribute; and, when the project stylesheet
exists, that stylesheet may declare no class the shared kit already declares and no more distinct
classes than the shared kit has. A class used on exactly one screen is warned, never refused.
These rules bind as a `⚠️` warn while the mock is unbound or unratified and as a violation once it
is `ratified`/`approved`/checked under `--matrix` — the same stamp specs/20260824/03's own
hygiene checks bind at.

The behavioural half of both amendments is carried entirely by specs/20260912/09's own Decisions
D1–D8: the three-layer home, the binding predicate, the `<style>`/`style=` refusal, the
redefinition and cap checks, the single-screen warn, the measured layout-share line, and hygiene
(a)'s new satisfying route. This ADR records only that specs/20260824/03's own words and
ADR-0013's authoring rules are superseded and extended, per the convention that a locked record
is narrowed or extended by backlink, never rewritten as if the later version had always been
true.

## Consequences

- A bound mock that links the wire register and carries no `<style>` block now passes hygiene
  check (a); the same mock with neither a register link nor its own reset still fails it exactly
  as specs/20260824/03 originally specified.
- A reader of specs/20260824/03's D1 who wants to know what satisfies check (a) today finds the
  `Amended by` line and follows it here rather than trusting a route that no longer exists for a
  register-linking mock.
- A reader of ADR-0013's authoring rules who wants to know what CSS a labelled mock may carry
  finds the same line and the invention bar in full, rather than a rule set silent on the
  question.
- specs/20260912/09's own Contracts and Behavior sections remain the executable source of the
  three-layer rule, the binding predicate, and the measured line; this ADR is the durable account
  of why the two locked records' wording changed, not a second copy of the mechanism.

## Dissents

None recorded — the amendment narrows one hygiene check's satisfying route and extends one
record's authoring rules rather than reopening a design ruling, and no dissent was raised against
specs/20260912/09's Decisions at lock.
