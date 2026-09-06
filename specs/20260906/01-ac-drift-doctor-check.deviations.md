# Deviations — 01-ac-drift-doctor-check

- AC-20260906-01-14's design-atlas.js clause reads "WHEN design-atlas.js runs with no arguments
  THE SYSTEM SHALL print a usage containing `stop open` and no `--question`". Traced empirically:
  a truly bare `node design-atlas.js` (zero argv) falls to the final dispatch `die('usage:
  design-atlas.js <check|gallery|build|shell|serve|stop> …')`, which never contains the substring
  `stop open` (or even `open`) before or after D8 — that reading is permanently unsatisfiable and
  is not part of D8's File Plan (D8 only touches the `stop open` header-comment usage line and the
  `flagArg(args, '--question')` read). `node design-atlas.js stop open` (the bare subcommand, no
  flags) dies with `stop open: --root <r> is required`, which does contain `stop open` and,
  post-D8, never `--question` — this is the interpretation tests/consistency/retired-flags.test.js
  pins. Traced and logged per the "AC example points at an unreachable branch" convention rather
  than forced red on an unreachable literal reading.
- AC-20260906-01-10 mixes a SHALL CONTINUE TO clause with two new promises (the
  `V7_APPLIES_FROM` export and the `--applies-from` refusal) in one bullet, so red-check.js
  classifies tests/review/promise-sweep.test.js — whose only own-spec AC is AC-10 — as
  green-expected, and the new-promise test there raised `broken-pin` at the TESTS mark. The
  retagged not-applicable pin stays in promise-sweep.test.js; the two new-promise assertions
  moved to tests/consistency/retired-flags.test.js (red-expected, already owning the
  promise-sweep flag deletion under AC-14), still citing AC-20260906-01-10. Same class as the
  D16 lesson recorded at specs/20260903/01 — an AC never mixes a new promise with SHALL
  CONTINUE TO.
- D10's literal version-bump target (7.89.0) was stale by build time — current at start of
  this build was 7.90.1, so the plugin bumped to 7.91.0, the next free minor, per the
  Gotchas' version-bump-target entry (spec/scripts/spec-status.js / spec-pipeline.md
  Gotchas: "a spec Decision naming a literal version-bump target can be stale by build
  time … the build bumps to the next free version and records the deviation").
- The comment-narration sweep (tests/consistency/comment-narration-live.test.js) was red on the
  pre-image: a person + date literal in design-atlas.js's card-height comment (landed by a direct
  commit, outside any spec's build gate). design-atlas.js is a File Plan row here, so the comment
  was reworded in this build (rule kept, narration dropped); the new ci-gate-parity test header
  had the same shape (a date) and was reworded the same way. No behaviour change either side.
- A5's backlog figure re-measured with the shipped script on this repo: 41 findings across 13
  done specs (84 done specs at or after the floor scanned, 884 criteria, 52 pre-v7 specs
  skipped) against A5's "42 across 20". The findings count matches within one; the spec/criteria
  denominators differ because A5's spike counted only specs with findings. The queued clean-up
  reads the script's own output, never this figure.
- Version target moved twice: the spec's literal 7.89.0 was stale at build (7.90.1 was current),
  so the doctrine worker bumped to 7.91.0; a sibling session's direct commit (c546082) then
  swept the working-tree plugin.json into its own commit, keeping the 7.91.0 number for its
  7.90.2 changelog entry and dropping this spec's paragraph. This spec re-bumps to 7.92.0, the
  next free minor, and re-adds its paragraph at the top of the last-3 changelog. The same commit
  also carried this spec's D9 mocks-driver.js header line alongside the sibling's skill-check
  work; that row is landed on main, not in this spec's checkpoint commit.
