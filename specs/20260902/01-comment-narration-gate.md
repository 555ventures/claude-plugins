---
date: 2026-09-02
status: done
tier: critical
area: gate-integrity
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260902/02-plugin-code-sweep.md", "specs/20260902/03-plugin-prose-sweep.md", "specs/20260902/04-host-generators-owner-citations.md"]
brief: 21
open_markers: 0
spiked: 2026-09-02
build_base: main
diff_base: 1f6a7ed5ab1807d241a15374be383934d493a43a
---

# Comment narration gate: owner citations, never history

## Goal

A comment or rule note cites an owner id in one line and never narrates dates, people,
hosts, versions, or prior behavior. This spec makes that rule un-violable in this repo: a
deterministic scanner (`comment-narration.js`) classifies whole-line comments and markdown
prose against six narration classes, ratchets against a tracked per-file baseline so the
existing debt cannot grow while siblings 02/03 sweep it to zero, proves a sweep touched no
executable line (`--code-identical`), and scans a host's generated rules layer for
`/spec:doctor` (`--rules-mode`). The five convention homes that currently mandate "why (dated
incident)" in every header move together to the new rule. Done means: the standing test is
green against the tracked baseline, every class fires on a synthetic tree, the oracle
distinguishes comment-only edits from code edits, and `/spec:doctor` invokes the rules-mode
scan as its numbered check 16.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **`spec/scripts/comment-narration.js`** is created (Node built-ins only; `#!/usr/bin/env node` + `'use strict'`; hand-rolled `--flag value` parsing). Three modes, exactly one per invocation: **plugin scan** `--root <dir>`; **rules scan** `--rules-mode <hostRoot>`; **oracle** `--root <dir> --code-identical <git-ref>`. Shared flags: `--baseline <file>`, `--hosts <csv>`, `--people <csv>`, `--json`. Exit codes: 0 no findings (or every file within baseline / every file identical), 1 findings (or an overage / a non-identical file), 2 bad invocation (missing mode, two modes, unreadable `--root`/`--baseline`, unresolvable `--code-identical` ref, git not answering) — stderr `comment-narration: <message>` naming the remedy. Every payload print goes through a synchronous fd-1 writer (host § Gotchas: `console.log` + `process.exit` truncates at 64 KiB). (AC-20260902-01-1, AC-20260902-01-9, AC-20260902-01-10) | The shape is `prose-cap.js` (flags, ratchet, exit alphabet) applied to comments; one script, three modes, because all three share the discriminator and the class list. |
| D2 | **Scope by location, never by name-shape.** Plugin scan walks every file under `spec/scripts`, `spec/bin`, `scripts`, `tests` (code group; `tests/fixtures/**` excluded) and every `*.md` under `spec/commands`, `spec/doctrine`, `spec/agents`, `spec/templates`, `git/commands`, `.claude/rules`, `.claude/agents` (prose group), relative to `--root`. `spec/workflows/` is not scanned (frozen scripts, host § Worker Rules). Rules scan walks `<hostRoot>/.claude/rules/**/*.md`, `<hostRoot>/.claude/agents/*.md`, and every string-valued `notes` field of `<hostRoot>/.claude/rules/enforcement.json` entries (each note reported as file `.claude/rules/enforcement.json#<entry id>`, line = 1-based index of the entry). Missing directories are skipped silently; a missing `enforcement.json` is not an error. (AC-20260902-01-5, AC-20260902-01-6) | Host § Gotchas (entry-point conformance): admit everything inside the directory; a name-shape filter is the evasion surface. `.md` is the only extension filter and it selects the prose discriminator, not membership. |
| D3 | **Discriminator: whole-line only.** Code group: a line is a comment iff its trimmed form starts with `//`, or starts with `#` not immediately followed by `[A-Za-z0-9_$]`; line 1 starting `#!` is never scanned. Prose group: every line outside a ``` fence is scanned (frontmatter and `<!-- -->` included). Trailing `//` after code, `/* */` blocks, and `*` continuation lines are NOT comments to this script — a documented non-goal (brief § Out of scope; the identical rule in `tests/host-config/config-read.test.js`). (AC-20260902-01-2, AC-20260902-01-6) | Decidable in one comparison; the only comment grammar this repo's guards already trust. |
| D4 | **Six classes, one finding per line** (a line hitting several classes lists them all, counts once). `date`: `\b20\d{2}-\d{2}(-\d{2})?\b` or `\b(Jan\|Feb\|Mar\|Apr\|May\|Jun\|Jul\|Aug\|Sep\|Sept\|Oct\|Nov\|Dec)[a-z]*\.? 20\d{2}\b`. `version`: `\bv?\d+\.\d+\.\d+\b` evaluated after every backtick span is blanked (a backticked version is an example literal, never narration). `prior`: case-insensitive whole-word alternation of `previously`, `no longer`, `used to`, `formerly`, `originally`, `the original`, `was (deleted\|removed\|renamed\|added\|dropped\|retired)`, `since (deleted\|removed)`, `deleted at`, `retracted`, `now (lives\|returns\|reads\|emits\|counts\|uses)`, `had been`, `before this (spec\|change\|fix)`, `pre-v\d`. `story`: `caught at (review\|build\|lock)`, `found at review`, `fixed in the same session`, `fail-open fix`, `the (first\|second\|third\|fourth\|fifth\|sixth) (recurrence\|such)`, `founding incident`. `host`: whole-word case-insensitive match of any `--hosts` literal (default none). `person`: same for `--people` (default none). The words `incident`, `ruling`, `legacy`, `recurrence` alone are NOT classes (measured: contract vocabulary in core § Incident Policy, § Decisions, and the config's legacy-mode text). (AC-20260902-01-1, AC-20260902-01-7, AC-20260902-01-8) | Calibrated on the live tree 2026-09-02 (Assumptions A2): the class list flags 759 code lines and 64 prose lines; 7 of the 64 are contract phrasing, all reworded by sibling 03 rather than exempted — an exemption grammar is a hole. |
| D5 | **Output.** Human render: one line per finding `<file>:<line> [<class>[,<class>]] <trimmed text ≤160 chars>`, then a summary `N findings in M files` (plugin/rules scan) or `identical: N files` / `N files differ` (oracle). `--json` (sole stdout): `{"mode":"plugin"\|"rules"\|"code-identical","findings":[{"file","line","classes":[…],"text"}],"files":{"<rel path>":count},"total":N}` for scans; `{"mode":"code-identical","base":"<ref>","files":N,"differ":[{"file","reason":"code-changed"\|"missing-at-base"\|"deleted"}]}` for the oracle. Paths are `--root`/`--rules-mode`-relative with forward slashes. (AC-20260902-01-1, AC-20260902-01-4, AC-20260902-01-9) | Sibling 02/03 workers drive the sweep from `findings`; the baseline is derived from `files`. |
| D6 | **Ratchet baseline.** `--baseline <file>` names a JSON object `{"<rel path>": <count>}`. A scanned file passes iff its finding count ≤ its baseline count (absent path → 0). Overage lines print as `<file>: <count> findings > baseline <N>` on stderr; exit 1. No flag writes or regenerates the baseline — it is hand-committed once at this spec's build from `--json`'s `files` map (`.claude/comment-narration.baseline.json`, only paths with count > 0) and only ever shrinks (siblings 02/03 delete entries; 04 deletes the file). A renamed file has no entry and must be clean. (AC-20260902-01-3) | Brief open question 3: per-file counts ratchet monotonically; per-line hashes would let a narrated line be rewritten into another narrated line. A rename mid-sweep forces cleanup, which is the sweep's job anyway. |
| D7 | **`--code-identical <ref>`** lists `git ls-files` under the code-group directories at `--root` (same exclusions as D2), and for each compares `strip(git show <ref>:<path>)` with `strip(worktree file)`, where `strip` = drop D3 comment lines and blank lines, trim every remaining line, join. A path absent at `<ref>` → `missing-at-base`; a tracked path absent from the worktree → `deleted`; a stripped mismatch → `code-changed`. Exit 0 iff zero differ. Trailing-comment and block-comment edits are code changes to the oracle by construction (D3). (AC-20260902-01-4) | Executed 2026-09-02 (A3): comment-only edits and bash `#` header edits read identical; a `15→16` literal edit, a new trailing comment, and a rename all read as differences. |
| D8 | **`spec/bin/spec-paths`** gains `comment-narration) echo "$ROOT/scripts/comment-narration.js"` (after `memory-sweep`) and the usage string lists `comment-narration`. (AC-20260902-01-11) | Commands resolve scripts only through `spec-paths` (`.claude/rules/conventions/doctrine.md`). |
| D9 | **`spec/commands/doctor.md`** gains check **16. Rules-layer narration** (deterministic, advisory), after check 15: run `node "$(spec-paths comment-narration)" --rules-mode .`; each finding line is a narration finding in the rules layer; under `--fix` each is a line-item patch at the repair-mode bar (before → after: the note rewritten as tag + rule + one owner citation — spec path, AC-ID, D-number, ADR, run id — evidence = the finding line itself). The closing recommendation paragraph and the checks' numbering above 16 are unchanged. Read load stays ≤ 500 (387 today). `[no-ac: command prose; the invocation literal is forward-verified by tests/consistency/entrypoints.test.js against D10's manifest row]` | Doctor is the only reader of the rules mode; hosts refresh by running it (brief § Scope 3). |
| D10 | **`spec/entrypoints.json`** adds `"spec/scripts/comment-narration.js": {"entryPoints": ["spec/commands/doctor.md"]}` (alphabetical position). (AC-20260902-01-12) | The live entrypoints pin refuses an executable with no declared caller, and tests are not call sites in its corpus. |
| D11 | **Convention rewrite, five homes, one wording.** The header rule becomes: *Header comment before the first statement: usage line · the one owner citation (spec path, AC-ID, D-number, ADR, run id, pin id) for why it exists · what it deliberately does NOT do · `Exit codes:` list — never dates, people, hosts, versions, or prior behavior (`comment-narration.js` enforces; provenance lives in git, specs, ledgers, ADRs).* Applied to: `.claude/rules/conventions/scripts.md` (the "Header comment" bullet); `.claude/rules/conventions/tests.md` ("Header comment cites the owner id the test pins — spec path, AC-ID, or escape row id — in one line; pipeline-authored tests cite AC-IDs in test names; never dates, people, hosts, versions, or prior behavior"); `.claude/rules/spec-pipeline.md` § Worker Rules ("Every script starts with a header comment: usage line, the one owner citation…"), § Test Rules ("Tests cite the owner id they pin in a header comment — spec path, AC-ID, or escape row id; pipeline-authored tests…"), § Build ("tests here are pinned invariants with owner citations — weakening one…"); `.claude/agents/gate-scripts.md` (the Header comment constraint, "5–12 lines is normal"); `.claude/agents/plugin-tests.md` ("Header comment (≤ 6 lines) after the requires: the owner citation the test pins…"). No other sentence in those files changes; no new paragraph explaining the rule anywhere (brief § Out of scope). `[no-ac: rule prose — the gate is the enforcement; the headers these rules produce are what AC-20260902-01-13 scans]` | Brief § Current state: the convention was init-generated from observed habit, never decided; five copies say "dated incident" today (the fifth, `plugin-tests.md`, found at planning). |
| D12 | **Standing test** `tests/consistency/comment-narration-live.test.js`: runs the plugin scan over `ROOT` with `--hosts upwell,prax,salon-os,salon os,hearwell,hiwora,zubu,bwm,cctop,autopilot-hub --people JJ,founder`, adding `--baseline .claude/comment-narration.baseline.json` iff that file exists; asserts exit 0 with the script's stderr as the message. A second test asserts every baseline path exists on disk (a dead entry is deleted, never carried). (AC-20260902-01-13) | The gate lands before the sweep so the mess cannot regrow (brief § Scope order); the baseline makes it green on day one. |
| D13 | **Behavioral tests** `tests/comment-narration/comment-narration.test.js`: synthetic trees in `tmpdir()`, `runNode('scripts/comment-narration.js', …)`, one test per AC below, `gitRepo()` for the oracle. Each assert's third arg states the consequence of failure. (AC-20260902-01-1 … AC-20260902-01-12) | Host § Test Rules. |
| D14 | `spec/.claude-plugin/plugin.json`: version bump target 7.57.0 (next free if taken); the changelog paragraph (last-3 form: 7.57.0, 7.56.1, 7.56.0) names the gate, the oracle, doctor check 16, and the convention rewrite. `[no-ac: manifest — pinned by tests/consistency/plugin-version.test.js]` | Host § Planning. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/comment-narration.js | CREATE | scripts | D1–D7: scanner, ratchet, oracle, rules mode, `--json` |
| spec/bin/spec-paths | MODIFY | scripts | D8: `comment-narration` key + usage string |
| spec/entrypoints.json | MODIFY | doctrine | D10: manifest row for the new script |
| spec/commands/doctor.md | MODIFY | doctrine | D9: check 16 Rules-layer narration; `--fix` line-item patches |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D14: 7.57.0 + changelog paragraph |
| .claude/rules/conventions/scripts.md | MODIFY | other | D11: header bullet |
| .claude/rules/conventions/tests.md | MODIFY | other | D11: header bullet |
| .claude/rules/spec-pipeline.md | MODIFY | other | D11: § Worker Rules, § Test Rules, § Build sentences |
| .claude/agents/gate-scripts.md | MODIFY | other | D11: header constraint |
| .claude/agents/plugin-tests.md | MODIFY | other | D11: header bullet |
| .claude/comment-narration.baseline.json | CREATE | other | D6: per-file counts from `--json` `files` (count > 0 only), written by the scripts worker after D1 lands |
| tests/comment-narration/comment-narration.test.js | CREATE | tests | AC-20260902-01-1, AC-20260902-01-2, AC-20260902-01-3, AC-20260902-01-4, AC-20260902-01-5, AC-20260902-01-6, AC-20260902-01-7, AC-20260902-01-8, AC-20260902-01-9, AC-20260902-01-10, AC-20260902-01-11, AC-20260902-01-12 |
| tests/consistency/comment-narration-live.test.js | CREATE | tests | AC-20260902-01-13 |

Orchestrator duty (outside the table): the baseline row is produced by the `scripts` worker
in the same wave as D1 — run `node spec/scripts/comment-narration.js --root . --hosts … --people … --json`
(the D12 lists), keep `files`, drop zero counts, write the JSON sorted by path. The
`other`-wave convention edits do not change the counts (D11 adds no narration class).

## Contracts

```text
node comment-narration.js --root <dir> [--baseline <file>] [--hosts <csv>] [--people <csv>] [--json]
node comment-narration.js --rules-mode <hostRoot> [--baseline <file>] [--hosts <csv>] [--people <csv>] [--json]
node comment-narration.js --root <dir> --code-identical <git-ref> [--json]

stdout (scan, human):   <file>:<line> [<class>[,<class>]] <text>      … then  N findings in M files
stdout (scan, --json):  {"mode":"plugin"|"rules","findings":[{"file":"spec/scripts/x.js","line":4,
                         "classes":["date"],"text":"// 2026-09-02 fix"}],"files":{"spec/scripts/x.js":1},"total":1}
stdout (oracle, human): [<file> <reason>]… then  identical: N files  |  N files differ
stdout (oracle, --json):{"mode":"code-identical","base":"<ref>","files":153,"differ":[{"file":"spec/scripts/x.js","reason":"code-changed"}]}
stderr (overage):       comment-narration: spec/scripts/x.js: 3 findings > baseline 2 — remove narration, never raise the baseline
stderr (usage):         comment-narration: <what is wrong> — usage: node comment-narration.js --root <dir> | --rules-mode <hostRoot> | --root <dir> --code-identical <ref>

Exit: 0 clean/within baseline/identical · 1 findings/overage/differ · 2 usage or precondition
Baseline file: {"<rel path>": <count>, …}   (sorted keys; counts > 0 only; hand-committed; only shrinks)
```

Classes and the comment discriminator are locked in D3/D4 and are the sole grammar workers
implement — no synonyms added, none removed.

## Behavior

- Scan: walk D2's directories; for each file split on `\n`; select comment lines per D3;
  blank backtick spans for the `version` test only; test each class; emit one finding per
  matching line. `files` counts findings per path. Baseline check runs after the walk.
- Rules mode: same classes, prose discriminator for `.md`; `enforcement.json` parsed with
  `JSON.parse` — a parse failure is exit 2 naming the file; entries without a string `notes`
  are skipped.
- Oracle: `git -C <root> ls-files -- spec/scripts spec/bin scripts tests` minus
  `tests/fixtures/`; `git show <ref>:<path>` per file (`stdio` pipe, non-zero → `missing-at-base`).
- Edge cases: empty tree → `0 findings in 0 files`, exit 0; a baseline file that is not a
  JSON object → exit 2; `--root` and `--rules-mode` together → exit 2; CRLF files are split
  on `\n` and trimmed, so `\r` never lands in `text`.

## Acceptance Criteria

- **AC-20260902-01-1**: WHEN a scanned code file holds a whole-line comment matching a class THE SYSTEM SHALL exit 1 and print the finding (`spec/scripts/x.js` line 4 = `// 2026-09-02 fix: previously crashed` → stdout `spec/scripts/x.js:4 [date,prior] // 2026-09-02 fix: previously crashed` and `1 findings in 1 files`; `--json` → `"total":1`, `"files":{"spec/scripts/x.js":1}`) → test in tests/comment-narration/comment-narration.test.js
- **AC-20260902-01-2**: WHEN every comment line in the tree is clean THE SYSTEM SHALL exit 0 with `0 findings in N files`, and a narration token on a code line after a trailing `//` or inside `/* */` SHALL NOT be reported (`const cap = 15 // 2026-09-02` → 0 findings; `// x.js — usage; specs/20260902/01-comment-narration-gate.md D1; Exit codes: 0 ok` → 0 findings) → test in tests/comment-narration/comment-narration.test.js
- **AC-20260902-01-3**: WHEN `--baseline` is given THE SYSTEM SHALL pass a file at or under its baseline count and fail one over it or absent from the baseline (`{"spec/scripts/x.js":2}` with 2 findings → exit 0; 3 findings → exit 1, stderr contains `spec/scripts/x.js: 3 findings > baseline 2`; `spec/scripts/y.js` with 1 finding and no entry → exit 1) → test in tests/comment-narration/comment-narration.test.js
- **AC-20260902-01-4**: WHEN `--code-identical <ref>` runs on a `gitRepo()` whose only edits since `<ref>` are whole-line comment and blank-line changes THE SYSTEM SHALL exit 0 printing `identical: N files`; WHEN an executable line changed (`let cap = 15` → `let cap = 16`), or a code line gained a trailing `// note`, or a file was renamed THE SYSTEM SHALL exit 1 naming the file and reason (`spec/scripts/x.js code-changed`; renamed → `spec/scripts/x2.js missing-at-base` and `spec/scripts/x.js deleted`) → test in tests/comment-narration/comment-narration.test.js
- **AC-20260902-01-5**: WHEN `--rules-mode <hostRoot>` runs THE SYSTEM SHALL scan only `.claude/rules/**/*.md`, `.claude/agents/*.md`, and `enforcement.json` `notes` strings (host with `.claude/rules/spec-pipeline.md` line 3 = `- [host] fixed 2026-07-11 after UpWell shipped` and `enforcement.json` entries `[{"id":"web:x","notes":"pinned as of 2026-07-11"}]` and `src/a.js` = `// 2026-01-01` → exactly two findings: `.claude/rules/spec-pipeline.md:3 [date]` and `.claude/rules/enforcement.json#web:x:1 [date]`; `src/a.js` absent from output) → test in tests/comment-narration/comment-narration.test.js
- **AC-20260902-01-6**: WHEN a markdown file carries a narration token inside a ``` fence THE SYSTEM SHALL NOT report it, and SHALL report the same token outside the fence, including inside frontmatter or an HTML comment (`description: JJ's queue` with `--people JJ` → `[person]`; fenced `2026-01-01` → nothing) → test in tests/comment-narration/comment-narration.test.js
- **AC-20260902-01-7**: WHEN a version token is backticked THE SYSTEM SHALL NOT report it, and SHALL report a bare one; WHEN a date-shaped run sits inside an AC-ID, a spec path, or a run id THE SYSTEM SHALL NOT report it (`// \`7.9.0\` sorts after \`7.11.0\`` → 0; `// bumped to 7.54.0` → `[version]`; `// AC-20260820-04-5 pins specs/20260820/04-x.md, run rv_640c582f4902` → 0; `// Aug 2026 measurement` → `[date]`) → test in tests/comment-narration/comment-narration.test.js
- **AC-20260902-01-8**: WHEN `--hosts` / `--people` literals are given THE SYSTEM SHALL report whole-word case-insensitive matches under `host` / `person` and report nothing for those classes without the flags (`# UpWell shipped 10 days` with `--hosts upwell` → `[host]`; `// JJ ruling` with `--people JJ` → `[person]`; `// upwelling tide` with `--hosts upwell` → 0; either line without flags → 0) → test in tests/comment-narration/comment-narration.test.js
- **AC-20260902-01-9**: WHEN `--json` is given THE SYSTEM SHALL print exactly one JSON object as its whole stdout matching the Contracts shape, complete for a payload larger than 64 KiB (a synthetic tree with 3,000 narrated lines → `JSON.parse` succeeds and `total === 3000`) → test in tests/comment-narration/comment-narration.test.js
- **AC-20260902-01-10**: WHEN invoked without a mode, with two modes, with an unreadable `--baseline`, or with an unresolvable `--code-identical` ref THE SYSTEM SHALL exit 2 with stderr beginning `comment-narration:` and containing `usage:` (`--root d --rules-mode d` → 2; `--baseline /nonexistent` → 2 naming the path; `--code-identical nope` in a `gitRepo()` → 2 naming the ref) → test in tests/comment-narration/comment-narration.test.js
- **AC-20260902-01-11**: WHEN `spec-paths comment-narration` runs THE SYSTEM SHALL print the absolute path of `spec/scripts/comment-narration.js` (exit 0) and the usage line printed for an unknown key SHALL contain `comment-narration` → test in tests/comment-narration/comment-narration.test.js
- **AC-20260902-01-12**: WHEN the entrypoints manifest is read THE SYSTEM SHALL map `spec/scripts/comment-narration.js` to `["spec/commands/doctor.md"]` and `spec/commands/doctor.md` SHALL contain the literal `spec-paths comment-narration` → test in tests/comment-narration/comment-narration.test.js
- **AC-20260902-01-13**: WHEN the suite runs THE SYSTEM SHALL run the plugin scan over this repository with the D12 host/people lists and the tracked baseline (when present) and observe exit 0, and every baseline path SHALL exist on disk → tests/consistency/comment-narration-live.test.js

## Assumptions (escalation triggers)

- A1: The six classes and the whole-line discriminator produce a usable finding list on this repo — **executed 2026-09-02** with a prototype of D3/D4 over the D2 scope: 153 code files and 40 prose files scanned; 759 code lines and 64 prose lines flagged; by class (code/prose): date 542/29, prior 148/16, host 81/6, person 37/4, version 25/6, story 7/7; 160 files carry ≥1 finding; heaviest: `tests/consistency/genesis-doctrine.test.js` 45, `tests/replay/replay.test.js` 43, `.claude/rules/spec-pipeline.md` 41. — **if false** (the real script's counts differ by >10% from these): the class regexes drifted from D4; fix the script, never the lists.
- A2: The prose false-positive rate is acceptable — **executed 2026-09-02**: of 64 prose hits, 7 are contract phrasing (`no longer exists` in status.md:77, enter-worktree.md:46/105, merge.md:91; `the original review` replay.md:141; `no longer written` doctor.md:105; `v0.4.0` example release.md:26); an earlier list including `legacy`, `incident`, `ruling`, `recurrence` as story terms produced 63 prose story hits, nearly all doctrine contract vocabulary, and was cut. — **if false** (sibling 03 finds the reworded lines unreadable): widen nothing; reword differently.
- A3: `strip`-and-compare is a faithful oracle — **executed 2026-09-02** in a scratch clone at HEAD `41293e4` over 153 tracked code files: untouched tree 0 differ; header comment rewrite in `prose-cap.js` 0 differ; bash header edit in `spec-paths` 0 differ; `let cap = 15`→`16` → 1 differ; added trailing `// new trailing` → 1 differ; `git mv prose-cap.js prose-cap2.js` → 1 differ (missing-at-base). — **if false**: STOP, ask the user.
- A4: Regex non-collision — **executed 2026-09-02**: `\b20\d{2}-\d{2}(-\d{2})?\b` does not match `AC-20260820-04-5`, `specs/20260820/04-x.md`, `rv_640c582f4902`, `20260902`; matches `2026-08-24 measured` and `(2026-07)`. Backtick blanking: `` `7.9.0` sorts after `7.11.0` `` → no version hit; `gh 2.93.0` and `bumped to 7.54.0` → hit. — **if false**: the regexes in D4 are wrong; fix them to match these literals exactly.
- A5: Falsifiability — **executed 2026-09-02**: a synthetic tree with one clean script reports 0; appending `// 2026-09-02 fix: previously this used to crash` reports 1 (classes date, prior). — **if false**: the class engine is broken; STOP.
- A6: Read-load headroom — **executed 2026-09-02**: doctor.md + `shared-for doctor` = 387 lines (cap 500); D9 adds ≤ 8 lines. — **if false**: shorten D9's wording, never touch `shared-for`.
- A7: `tests/consistency/entrypoints.test.js` pins manifest keys = executables under `spec/scripts` (minus `lib/`) — a new script needs exactly one manifest row and one real invocation in a corpus file; `tests/` are not corpus call sites (measured: the corpus list is commands/doctrine/agents/templates/git commands/scripts/workflows). — **if false**: the manifest row is still required by D10; the invocation lives in doctor.md either way.
- A8: `enforcement.json` `notes` exists on legacy hosts only — **executed 2026-09-02**: upwell (`spec@6.74.0`) 21 of 22 entries carry narrated notes; prax (`spec@6.58.0`) 0 of 15; the current `enforce.md` Phase 6 manifest schema has no `notes` field. — **if false**: D2's rules mode covers it regardless.
- A9: No `/* */` block comments exist in `spec/scripts` or `tests` (measured: zero files match `^\s*/\*`); the whole-line discriminator loses nothing there. — **if false**: still a non-goal; record the count in Rationale.

## Rationale

The brief traced ~3,000 lines of history narration to one convention — "why (dated
incident)" — copied into five files and reinforced by every build worker since. The fix is
not a better paragraph; it is a script with an exit code (core § Incident Policy: guards are
deterministic, never prose) landing *before* the sweep so the debt is frozen the day the rule
changes. Admission against the five tests: **portability** — the discriminator is `//`, `#`,
and markdown, language-agnostic within this fleet's stacks, and rules mode targets only the
generated rules layer every host carries; **generality** — 160 files in this repo and four
hosts' rules layers (upwell 70, prax 53, salon-os 26, hearwell 13 narrated prose lines
measured 2026-09-02) carry the class; **materiality** — the class is a convention defect, not
an escape, so the count comes from the scanner (823 lines here, 162 across four hosts), not
`fleet-reader --json`'s `escapes.byClass` — stated as such; **falsifiability** — A5;
**removability** — delete the ratchet machinery (never the scan) when
`git log --oneline -- .claude/comment-narration.baseline.json` shows the file absent for 90
days and every host's check 16 reports 0 — both counts.

Rejected: per-line hash baselines (a narrated line rewritten into another narrated line
passes); an exemption grammar for contract phrases like "no longer exists" (a hole; seven
lines get reworded instead); deriving host and people lists from `git log` or `fleet-reader`
(a git author named `Claude` would flag every "Claude Code" mention — the lists are literal
and flag-supplied, the standing test owns this repo's); scanning `spec/workflows/` (frozen by
host § Worker Rules; edits there need a spec that names them). Trailing and block comments
stay out of scope on both sides — the scanner never reads them and the oracle treats them as
code — so a sweep that touches one is caught, not laundered. Critical tier because
`spec/bin/spec-paths` is a host § Risk Tiers surface; every AC carries a literal. What to
watch during build: the standing test is red until the baseline exists — the scripts worker
writes it in the same wave (File Plan note); `tests/spec-paths.test.js` does not pin an
exhaustive key set (measured), so no collateral row.

Collision closure at lock (literals `dated incident`, `incident headers`, `dated escapes`,
`host+date`): 11 hits — 6 planned (the five D11 homes; `spec-pipeline.md` carries three
literals) and 5 waived: `docs/audit/style-audit-2026-08-13.md` and
`docs/roadmap/21-comment-hygiene.md` (records by design), and the code comments in
`spec/scripts/init-gen.js`, `tests/consistency/genesis-doctrine.test.js`,
`tests/init-gen/generate.test.js` (sibling 02's sweep owns them; they are comments, not
pins). Paths leg: `spec/bin/spec-paths` is executed by many tests; D8 is additive and no
test pins an exhaustive key set.

Build deviation (one-off, folded at review close): D11's Applied-to text quoted
`.claude/agents/gate-scripts.md`'s line-count guidance as "5–12 lines is normal"; the file
reads "15–35 lines is normal". The on-disk figure was kept — the line count is not part of the
header-comment sentence D11 rewrites, and D11 forbids changing any other sentence.

Review fixes (rv_86d3458f366f, two fix-delta rounds, both CLEAN): the D2 walk admits
symlinked files and traverses symlinked directories only when the real target stays inside
`--root` (a symlink to an off-root file such as `/etc/hosts` is skipped, never read), with a
visited-set guard against symlink cycles; pinned by two AC-20260902-01-2 tests. D2's
"walks every file under" now includes symlinked entries by that rule.

## Canonical Delta

`docs/canonical/gate-integrity.md` gains a bullet after "Guards ban the name, not the shape":
**Comments cite owners, never history.** `comment-narration.js` classifies every whole-line
comment under `spec/scripts`, `spec/bin`, `scripts`, `tests` and every prose line of the
plugin's commands, doctrine, agents, templates, and rules against six narration classes —
dates, versions, prior-behavior vocabulary, incident-story vocabulary, host names, people —
and the suite runs it against a tracked per-file baseline that only shrinks. Provenance lives
in git, specs, ledgers, and ADRs; a comment states the current invariant plus one owner id.
`--code-identical <ref>` is the oracle for comment-only sweeps (stripped executable text
byte-identical per file), and `--rules-mode` is doctor check 16 for hosts' generated rules
layers. `docs/canonical/scripts.md` § Prose budgets gains one sentence: comment narration is
capped per file by `.claude/comment-narration.baseline.json` while the sweep runs, and at
zero once it is deleted.
