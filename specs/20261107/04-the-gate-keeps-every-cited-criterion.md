---
date: 2026-11-07
status: hardened
area: run
depends_on: [specs/20261107/03-this-repos-size-check-counts-bytes.md]
brief: n/a
architecture: true
breaking: false
---

# The gate keeps every cited criterion

## Intent
- You asked: "… the gate goes red on any acceptance criterion with zero citing tests unless the spec lists it as retired" — after 20261107/02's builder deleted the tests of kept behaviour to fit a line cap (94 AC-IDs lost their tests in one build; 55 had to be re-cited by hand). The size half is specs/20261107/03.
- I will build:
  - `spec/scripts/lib/criteria.js`: which files are tests, and which AC-IDs they cite at the run's base and in the worktree.
  - GATE, after a green `testCommand` and beside `buildProof`: red when a criterion cited at the base is cited by nothing now, or when a criterion of the spec being built has no citing test in a project whose tests already cite criteria; a warning in a project whose tests cite none.
  - An optional `## Retired criteria` section in the spec being built, which clears both; `plan.js lock` checks it and the builder and reviewer briefs print it.
  - The optional `testGlobs` config key, a doctor info line, and the prose in builder.md, reviewer.md, plan.md and architecture §3, §4 and §6.
- I will not touch:
  - Projects whose tests cite no criterion: nothing turns red there, only a 📌 line names the uncited criteria of a spec being built.
  - `testCommand`, the gate cache, red-check's verdicts, `/spec:migrate` and any other spec file; no numeric config is added.
- Users will notice: a build that deletes or renames away the last test naming a criterion goes back to the builder with the ID named, and ends in a question to you unless the spec being built retired that criterion.
- You lose: a build's freedom to drop a criterion's last test without a locked retirement.
- Architecture or behaviour change: yes — the GATE step (architecture §4) gains a plugin-owned criteria check in every project; confirmed 2026-11-07, recorded as ADR-0048 (no accepted ADR is overturned)
- Client sign-off: a build may not drop the last test naming a criterion unless the spec being built retires it, in every project; ADR-0048 — yes to both (2026-11-07, with 20261107/03)

## Goal

A test that names a criterion can leave only with a retirement the user locked; every project with criterion-citing tests gets this at its next build, and a project without them is told, never blocked.

## Preparation

Hosts measured 2026-11-07 (test files by red-check's basename rule, then those citing an AC-ID): salon-os 308/344, prax 311/326 (plus 26 files under `tests/` only its `testGlobs` reaches), expense-tracking 189/209, kaigai 141/146, walkthrough 84/88, praxlab 44/50, autopilot-hub 24/25, this repo 19/27, zubu-menu 17/27; bwm-booking 0/18, cctop 0/3, zubu-ai and hearwell have none. prax and walkthrough still carry v7's `testGlobs`; no v8 code reads it. No v8 driver or lib reads citations today (`expire-tests.js` and `ac-matrix.js` were v7); red-check.js owns the only test-file rule (`TEST_NAME`). GATE's plugin-owned checks stack in `gateStep` as `buildProof(state, wt, rows)`. A test fixture may carry an AC-ID no spec defines (20261107/02 evidence: AC-20261104-01-1), so the watch is limited to IDs a spec defines.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | New `spec/scripts/lib/criteria.js` (≤ 250 lines, no CLI): `isTest(rel, cfg)` is red-check's basename rule (moved here; red-check.js requires it) or a match of any `cfg.testGlobs` glob through `lib/spec.js` `globToRe`; `cited(root, ref)` maps each `AC-\d{8}-\d{2}[a-z]?-\d+(?!\d)` to the test files holding it, read at `ref` with `git ls-tree -r` and one `cat-file --batch`, or from disk for the worktree (`git ls-files -c -o --exclude-standard`); `check({wt, base, cfg, doc})` returns `{red, warn}` lines. | No existing module reads test files at two trees: lib/spec.js reads spec text, red-check.js is a CLI that runs tests, and size-check.js is this repo's own `tests/`. One owner of "what is a test file" keeps red-check and this check from drifting; the reader names no tool and assumes no language (ADR-0034, architecture §3). |
| D2 | Rule (a): an ID cited at `state.base` that no test file cites now is red, when a spec on disk defines it (`specs/<date>/<NN>-*.md` holds its `- **AC-…**` bullet, or lists it in an `acs:` frontmatter line) and the spec being built does not list it under `## Retired criteria`. ADR-0048. [asked: yes to both] | Base-cited minus now-cited is the set that caught 20261107/02's 94 drops; limiting it to defined IDs stops a fixture's made-up ID from reddening a build. |
| D3 | Rule (b): an AC of the spec being built (`doc.acs`; a spec-less fix has none) that no test file cites, and that its Retired criteria does not list, is red when the base cites at least one AC-ID; otherwise the run adds one 📌 line naming them and stays green. [asked: yes to both] | Hosts that name criteria in tests get coverage from birth, so rule (a) protects them later; bwm-booking, cctop and zubu-ai cite none and keep building unchanged. |
| D4 | `run.js` `gateStep`: once `testCommand` is green, the tail is `buildProof(...)`, else `criteria.check(...)`'s red lines; red goes to REPAIR and counts toward `REPAIR_CAP` as today. The red tail names each ID and its two exits: restore a test citing it, or, when a Decision of this spec retires it and the spec does not list it, reply that the Decision is unmet as written (the run's `unmet` question, so the user amends). A spec-less fix's second exit is `needs-plan`. | A lane may not edit a spec, so retiring a criterion is never its own call; the existing seam and exits carry this with no new step, mark or state. |
| D5 | `## Retired criteria` is optional, after Acceptance Criteria, with two line shapes: `- AC-… — retired by Dn: …` and `- AC-… — checked at review: …` (an AC of this spec read in the diff: prose, a one-time grep, a recorded count). Only the spec being built's section counts. `plan.js lock`, only when the section is present, refuses a line with no AC-ID, a `retired by` naming no row of its Decisions table, or a `checked at review` naming an AC not its own. `lib/briefs.js` `contract()` prints the section to builder and reviewer. | The retiring spec is the only spec a build may carry; once it merges, its IDs are cited at no later base, so no other spec's list is ever needed (a stub losing its body loses nothing). Prose criteria get a status without a prose test, which reviewer.md blocks. |
| D6 | `testGlobs` (an array of globs, default none) is promoted in architecture §3: a file matching one is a test file for D1 and for red-check. | prax's 26 test files under `tests/` match no basename rule; the key already exists in the two hosts that need it. |
| D7 | `doctor.js` `check()` adds one info line: `criteria: N of M test files cite an AC`, or `criteria: no test file cites an AC — new criteria are warned about, never refused`. | The one place a person sees which mode a project is in; info, never a finding. |
| D8 | Prose: builder.md — name the AC-IDs a test proves in its title, and delete a test only with a criterion this spec retires; reviewer.md — a criterion under Retired criteria needs no test: read each `checked at review` one in the diff and check each `retired by` Decision removes what the deleted test pinned; plan.md step 2 — one sentence on the section; architecture §4's GATE row and §6 name the check and the section; ADR-0048 records the change. | The briefs and plan.md are where builder, reviewer and planner meet the rule; §4 is the step table every driver change updates. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/lib/criteria.js | CREATE | D1–D3 |
| spec/scripts/run.js | MODIFY | D4 in `gateStep` |
| spec/scripts/red-check.js | MODIFY | D1: `TEST_NAME` moves out, `isTest` from lib/criteria.js |
| spec/scripts/plan.js + spec/scripts/lib/briefs.js | MODIFY | D5 |
| spec/scripts/doctor.js | MODIFY | D7 |
| spec/agents/builder.md + spec/agents/reviewer.md + spec/commands/plan.md + docs/v8/architecture.md | MODIFY | D6, D8 |
| tests/criteria.test.js | CREATE | AC-1 to AC-4 |
| tests/run.test.js + tests/plan.test.js + tests/red-check.test.js + tests/doctor.test.js | MODIFY | AC-5 to AC-9 |

## Acceptance Criteria

- **AC-20261107-04-1**: WHEN `cited` reads a tree holding `a.test.js` citing `AC-20990101-01-1` and `AC-20990101-01a-2`, `b_spec.py` citing `AC-20990101-01-11`, `notes.md` citing `AC-20990101-01-3` and, with `testGlobs: ["checks/**"]`, `checks/x.sh` citing `AC-20990101-01-4` THE SYSTEM SHALL map the first, second, third and fifth IDs to their files, never count `-11` as `-1`, and skip `notes.md`; at a base sha it SHALL read the committed text, not the disk.
- **AC-20261107-04-2**: WHEN a test citing `AC-20990101-01-1`, which a spec on disk defines, is deleted since the base THE SYSTEM SHALL report it red; and WHEN the spec being built lists it under `## Retired criteria`, or no spec defines the ID, THE SYSTEM SHALL report nothing.
- **AC-20261107-04-3**: WHEN the spec being built has an AC no test file cites and the base cites some AC THE SYSTEM SHALL report it red; WHEN it is listed `checked at review` THE SYSTEM SHALL report nothing; and WHEN the base cites no AC THE SYSTEM SHALL report it as a warning only.
- **AC-20261107-04-4**: WHEN a spec-less fix deletes a test citing a defined AC THE SYSTEM SHALL report it red with `needs-plan` as the second exit, and WHEN it deletes none THE SYSTEM SHALL report nothing.
- **AC-20261107-04-5**: WHEN `/spec:run` gates a green build that deleted a criterion's last citing test THE SYSTEM SHALL go to REPAIR with a tail naming the ID, `restore` and `unmet`, and SHALL go to REVIEW once a test cites it again; WHEN the project's tests cite no AC and the spec's ACs are uncited THE SYSTEM SHALL go to REVIEW and print one 📌 line naming them.
- **AC-20261107-04-6**: WHEN `plan.js lock` reads a Retired criteria line with no AC-ID, a `retired by D9` with no D9 row, or a `checked at review` naming another spec's AC THE SYSTEM SHALL refuse (exit 2) quoting the line; WHEN the section is valid or absent THE SYSTEM SHALL lock; and the builder and reviewer briefs SHALL carry its lines.
- **AC-20261107-04-7**: WHEN red-check runs with `testGlobs` naming a new file whose basename is not test-shaped THE SYSTEM SHALL check it, and SHALL CONTINUE TO check a new `*.test.*` file with no `testGlobs`.
- **AC-20261107-04-8**: WHEN `doctor.js` runs on a project where 2 of 3 test files cite an AC THE SYSTEM SHALL print `criteria: 2 of 3 test files cite an AC` as info, not a finding, and on one where none cite the warned-never-refused line.
- **AC-20261107-04-9**: WHEN this spec's build gates in this repo THE SYSTEM SHALL be green with the criteria check live, every AC of this spec but AC-20261107-04-10 cited by a test.
- **AC-20261107-04-10**: builder.md, reviewer.md, plan.md and architecture §3, §4 and §6 say what D6 and D8 name.

## Retired criteria

- AC-20261107-04-10 — checked at review: prose; no test reads prose.

## Assumptions

- A1: Hosts keep spec files at `specs/YYYYMMDD/NN-*.md`, as `plan.js new` writes them — if false: D2 finds no defining spec and watches nothing in that host; ask before widening it.
- A2: No host's tests cite an AC-ID that a spec defines only in prose and never as a bullet — if false: that citation is unwatched, and nothing turns red.
- A3: Reading every test file at two trees adds under a second to a gate in salon-os (344 files) — if false: record the time in evidence.md and keep the check; the gate cache already skips an unchanged tree.
