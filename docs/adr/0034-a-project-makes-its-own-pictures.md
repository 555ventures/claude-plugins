# 0034. A project makes its own pictures

- Status: accepted
- Date: 2026-10-05
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20261005/06-the-design-stage-sends-pictures.md)
- Applies to: ADR-0030 — clause (f) amended: the design stage may send pictures of the
  project's real screens, made by a command the project names.
- Amended by: —

## Context

ADR-0030 clause (f) and the later walkthrough records had the design stage push no picture
round: the plugin names no tool, and a picture needs a running app and a browser the plugin
must not assume. Clients reviewing a round still wanted to see real screens, and notes on a
picture had no place to say where on the picture they were made.

## Decision

- **A project declares how its pictures are made (D1).** The grounding contract gains an
  optional `pictures` block: `command`, `dir` and optional `widths` (1 to 4 distinct integers,
  240 to 3840, default 390 and 1280). The plugin names no tool; this repository's own config
  gains no block and is only re-stamped.
- **The plugin writes the wanted list (D4).** It walks every seed journey and its beats in
  order and writes `<dir>/wanted.json` (screen, state, width, file) before the project's
  command runs, so the command never re-derives the stories.
- **A round is every story (D13).** The prototype driver, the freeze and the build are
  untouched, and no picture note becomes a prototype pin.
- **The service's own tool takes over later.** When the review service ships its own terminal
  tool for uploading pictures, that tool takes over the upload; the `pictures` block keeps
  saying only how the pictures are made.

## Consequences

- The grounding contract changed, so hosts owe a `/spec:doctor` re-stamp.
- The round pull worklist names a note's spot on a picture.
- Picture rounds stay optional and never gate a stop.

## Applies to

- ADR-0030 — clause (f), the design stage's picture rule.
