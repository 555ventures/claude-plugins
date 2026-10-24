---
date: 2026-10-24
status: hardened
tier: standard
area: cross-cutting
breaking: false
depends_on: [specs/20261024/01-review-driver-reads-recorded-facts.md, specs/20261024/02-genesis-marks-and-the-no-stand-ins-test.md, specs/20261024/05-replay-retired.md]
brief: n/a
open_markers: 0
---

# Scripts drop their inline changelog; prose-size tests retire

## Goal

A quarter of the plugin's script lines are comments, and 82% of sampled comment blocks cite
a spec or decision id rather than explain the code; the two drivers are twice their real
size because of it. Four test files pin doctrine line budgets, frozen heading lists and
specific sentences, which is prose, not behaviour. This spec removes the citations from
whole-line comments while keeping every "why", certified comment-only against the base
commit, and retires the prose-size tests with their pins marked retired in the owning specs.
Done means zero citation tokens in script comments, an unchanged code body, and a green
suite with the four files gone.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | In every whole-line comment (`//` or `#` as the first non-blank text) under `spec/scripts/**/*.js`, `spec/scripts/**/*.sh` and `spec/bin/*`, remove citation tokens — spec paths `specs/YYYYMMDD/NN-*.md`, AC-IDs `AC-YYYYMMDD-NN[a-z]?-k`, decision ids `D<n>`, `R<n>`, `A<n>` used as citations, and the `(…)`/`:` wrapping that held only them — and delete a sentence left with nothing but the citation. The reason sentence stays. Exactly one `Owner:` line per file header, naming spec paths, is exempt (AC-20261024-04-1, AC-20261024-04-2) | The code carried its own changelog (1,414 citing comment lines, audit 2026-10-24); history lives in git and the specs. One owner pointer keeps the cold reader's way back. [asked: strip spec-id changelog comments] |
| D2 | The sweep is comment-only: `node spec/scripts/comment-narration.js --root . --code-identical $(git merge-base HEAD main)` exits 0 over the touched tree (AC-20261024-04-3) | The script already certifies a comment-only diff; a worker that touches code by accident is caught by a deterministic check, not a reviewer's eye. |
| D3 | Delete `tests/consistency/doctrine-budget.test.js`, `tests/consistency/doctrine-headings.test.js` and `tests/prose-debt/doctrine-pins.test.js`; in `tests/consistency/read-load.test.js` delete the read-load budget, command-ceiling and Rules-cap tests and keep the two `shared-for` behaviour tests (AC-20261024-04-4, AC-20261024-04-5) | Line budgets and frozen heading lists pin prose, not behaviour; `shared-for` printing exactly the pinned section list is behaviour and stays. [asked: retire the prose-size tests] |
| D4 | Every AC a deleted test was the sole citer of gets `[retired: specs/20261024/04-scripts-drop-their-inline-changelog.md]` appended to its bullet in the owning done spec; `node spec/scripts/ac-drift.js --root . --all-done` exits 0 is the oracle for completeness (AC-20261024-04-6) | ac-drift already reads the `[retired:]` tag; the worker tags what it reports, never a hand list. |
| D5 | `spec/scripts/prose-cap.js` stays: escape.md and stage-review.md still run it over a host's Gotchas section [no-ac: nothing changes] | Only the read-load use of it retires. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/**/*.js | MODIFY | scripts | D1 comment-only citation strip (every file under spec/scripts and spec/scripts/lib) |
| spec/scripts/**/*.sh | MODIFY | scripts | D1 comment-only citation strip |
| spec/bin/spec-paths | MODIFY | scripts | D1 comment-only citation strip |
| spec/.claude-plugin/plugin.json | MODIFY | scripts | `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/consistency/doctrine-budget.test.js | DELETE | tests | D3 |
| tests/consistency/doctrine-headings.test.js | DELETE | tests | D3 |
| tests/prose-debt/doctrine-pins.test.js | DELETE | tests | D3 |
| tests/consistency/read-load.test.js | MODIFY | tests | D3: keep only the two `shared-for` behaviour tests |
| tests/consistency/no-citation-comments.test.js | CREATE | tests | AC-20261024-04-1, AC-20261024-04-2, AC-20261024-04-3, AC-20261024-04-4, AC-20261024-04-5, AC-20261024-04-6 |
| specs/20261008/01-doctrine-states-contracts-and-points-at-its-enforcers.md | MODIFY | other | D4 `[retired:]` tags |
| specs/20260908/06-command-prose-states-contracts.md | MODIFY | other | D4 `[retired:]` tags |
| specs/20260823/06-prose-debt-pruning.md | MODIFY | other | D4 `[retired:]` tags |

## Contracts

Citation token grammar the test applies to whole-line comments (and only to them):

```js
const COMMENT_LINE = /^\s*(\/\/|#)(?!!)/            // whole-line // or # comments; shebangs excluded
const SPEC_PATH    = /specs\/\d{8}\/\d{2}[a-z]?-[\w-]+\.md/
const AC_ID        = /\bAC-\d{8}-\d{2}[a-z]?-\d+\b/
const DECISION_ID  = /\b[DRA]\d{1,2}\b(?![\w-])/   // D4, R9, A1 — never inside an identifier
const OWNER_LINE   = /^\s*(\/\/|#)\s*Owner:/         // at most one per file, exempt
```

## Behavior

- A comment `// D4 (specs/20260909/05-fix-delta-reviewer-pass.md): iteration >= 2 means a fix-delta
  cycle just completed — manifest-<n> and fix-delta-<n>.txt both exist` becomes
  `// iteration >= 2 means a fix-delta cycle just completed — manifest-<n> and fix-delta-<n>.txt both exist`.
- A comment `// specs/20260902/05 D6.` alone on a line is deleted.
- A header `// Owner: specs/20260902/01-comment-narration-gate.md D1-D7.` stays as the file's one
  owner line.
- Trailing `// …` after code and `/* … */` blocks are untouched (the sweep and the test read
  whole-line comments only, matching comment-narration.js's own definition).
- The worker is dispatched per file batch (the `scripts` agent), reads each comment, and rewrites by
  hand; no regex replacement is committed unread.

## Acceptance Criteria

- **AC-20261024-04-1**: WHEN the test scans every whole-line comment under `spec/scripts/**/*.js`, `spec/scripts/**/*.sh` and `spec/bin/*` THE SYSTEM SHALL find zero spec-path tokens and zero AC-ID tokens outside each file's single `Owner:` line → writes tests/consistency/no-citation-comments.test.js
- **AC-20261024-04-2**: WHEN the same scan is run for decision-id tokens (`D<n>`, `R<n>`, `A<n>` as whole words) THE SYSTEM SHALL find zero outside `Owner:` lines, and SHALL find at most one `Owner:` line per file → writes tests/consistency/no-citation-comments.test.js
- **AC-20261024-04-3**: WHEN `node spec/scripts/comment-narration.js --root . --code-identical <ref>` runs with `<ref>` = `git merge-base HEAD main` THE SYSTEM SHALL exit 0 (every scanned file identical once comments are removed) → writes tests/consistency/no-citation-comments.test.js
- **AC-20261024-04-4**: WHEN `tests/` is grepped for `AC-20261008-01-3`, `AC-20261008-01-4`, `AC-20260908-06-1`, `AC-20260908-06-2` and `AC-20260823-06-4` THE SYSTEM SHALL find zero hits, and the three deleted files SHALL not exist → writes tests/consistency/no-citation-comments.test.js
- **AC-20261024-04-5**: WHEN `spec-paths shared-for <cmd>` runs for every scoped command THE SYSTEM SHALL CONTINUE TO print exactly the pinned `## ` section list, in order → reuses tests/consistency/read-load.test.js :: AC-20260908-06-3
- **AC-20261024-04-6**: WHEN `node spec/scripts/ac-drift.js --root . --all-done` runs after the deletions THE SYSTEM SHALL exit 0 (every orphaned criterion carries a `[retired:]` tag naming this spec) → writes tests/consistency/no-citation-comments.test.js

## Assumptions (escalation triggers)

- A1: comment-narration.js `--code-identical <ref>` compares each scanned file with comments removed against the same file at `<ref>` and exits 0 only when all are identical (header, lines 6–27) — **if false:** the test falls back to `git diff <ref> -- spec/scripts spec/bin | grep '^[-+]' | grep -v '^[-+]\s*//'` being empty.
- A2: `ac-drift.js` treats a `[retired: <specs/…md>]` tag as a sanctioned orphan (header lines 12–20) — **if false:** STOP and ask whether to delete the orphaned bullets instead.
- A3: no script reads its own comments at runtime (only three test files read script source, none for citations; audit 2026-10-24) — **if false:** that test is in the File Plan as a MODIFY row and the reviewer flags it.
- A4: siblings 01, 02 and 05 have landed, so the sweep does not collide with their edits to the same files — carried by `depends_on`.

## Rationale

The 2026-10-24 bloat audit found no dead code (1,073 functions, all called) and 0.19%
duplication; the weight was 7,683 comment lines, 82% of a 40-block sample citing spec and
decision ids, 107 lines narrating retired code. Those citations were the pipeline's habit of
writing the changelog into the file it changed. The why-sentences are the part a cold reader
needs; the ids are what `git log -L` and the specs already hold. One `Owner:` line per file
is kept so the path back to design history survives.

The four test files were chosen by what they assert, not by their directory: budget,
heading-list and sentence pins over doctrine. The rest of `tests/consistency/` (entrypoints,
plugin-bump, dependency-free, citations-check, retired-flags) asserts behaviour and stays.
`read-load.test.js` keeps its two behaviour tests because `shared-for` printing the pinned
section list is what every command's doctrine load depends on.

The sweep is hand-done per file by workers because citation sentences wrap across lines
and a regex cannot tell a `D4` citation from a `D4` in prose about a decision. The
code-identical certificate is what makes the hand work safe. Rejected: deleting the 107
history-narration lines by rule — "retired"/"no longer" sentences sometimes carry the why;
the worker judges each.

Collision closure (literals `doctrine-budget`, `doctrine-headings`, `doctrine-pins`): the one
literals hit outside the File Plan is `spec/doctrine/replay-corpus.md`, deleted by the
dependency 20261024/05 before this spec builds — waived.

## Canonical Delta

docs/canonical/scripts.md: "Script comments explain why; they cite no spec, AC or decision
id except one `Owner:` header line per file. `tests/consistency/no-citation-comments.test.js`
pins it. Doctrine line budgets and heading lists are no longer pinned by tests."
