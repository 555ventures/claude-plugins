---
date: 2026-09-01
status: done
tier: critical
area: build-integrity
design: false
breaking: false
depends_on: ["specs/20260901/01-build-driver.md"]
depended_on_by: ["specs/20260901/03-unified-build-loop.md"]
brief: 18
build_base: c0113441b316a1de01a42534df0e1f876c7b88dd
diff_base: c0113441b316a1de01a42534df0e1f876c7b88dd
open_markers: 0
---

# Run Provenance — `via` and the session model on build and review rows

## Goal

Brief 18's kill condition is ledger-answerable only if every review row says which command
shape produced it (`via: "loop"` vs `"direct"`) and which model held the session. Neither
exists today: no ledger row carries `via` in that sense (escape rows use the key for
`commit|manual`), no row carries a model, and the session model is not in the shell
environment (measured 2026-09-01). This spec adds a never-blocking prompt hook that stamps the
session's id and transcript path to a per-root file, a library that derives the session model
from that transcript, `--via`/`--model` on `verdict.js`, and both drivers passing them onto
their rows. Done means: a review row and a build row written on a fixture host carry `via`
and `model` with the literal values below, and a host with no stamp file gets `model: null`
and `via: "direct"` with nothing refused. The fleet query that splits escapes-per-CLEAN by
`via` lands with the loop itself (sibling 03), where `loop` rows first exist.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New `UserPromptSubmit` hook `spec/scripts/spec-session-stamp.sh`, registered in `spec/hooks/hooks.json` as a third arm: on a prompt whose text starts with `/spec:` it writes `<cwd from stdin>/.claude/spec-session.json` = `{"session_id","transcript_path","cwd","ts"}` atomically (temp file + `mv`); on any other prompt, malformed stdin, missing `jq`, or an unwritable directory it exits 0 without writing. It never prints, never blocks. (AC-20260901-02-1) | The stamp is the only route from a hook's `session_id`/`transcript_path` (executed spike A1) to a driver subprocess that has neither. Rejected: adding the write to `spec-state-gate.sh` — a blocking hook's one job is to block; a side-effect write there is a second concern on a critical surface. |
| D2 | New `spec/scripts/lib/session-stamp.js`: `readSessionStamp(root)` → `{sessionId, transcriptPath, cwd, ts}` or `null` (absent/malformed); `sessionModel(root)` → the `message.model` string of the LAST `"type":"assistant"` line in the stamped transcript, read from the file's final 512 KiB, or `null` on any failure (missing stamp, missing file, no assistant line, unparseable line). Never throws. (AC-20260901-02-2) | The transcript format is documented as internal and version-unstable (Claude Code sessions doc); executed spike A2 shows the field is present today across four model ids. Fail-soft keeps a format change a `null` model, never a broken review. Rejected: `SessionStart`'s optional `model` field — documented as not always set and needs a fourth hook arm. |
| D3 | `verdict.js` gains `--via <loop\|direct>` (default `direct` when absent; any other value exit 2 usage) and `--model <id>` (free string; absent → `null`), review profile only; the row gains `via` then `model` immediately after `tier`; `--profile release` with either flag is exit 2. (AC-20260901-02-3, AC-20260901-02-6) | verdict.js rejects unknown flags (executed spike A3), so the fields must be first-class; defaulting `via` keeps every existing caller and test byte-compatible except the byte-identity test, which learns the two flags. Enum-checked because the drift census (brief 19) will read it. |
| D4 | `spec-review-driver.js` accepts `--via <loop\|direct>` on any invocation, records it in `review-state.json` at sidecar creation (default `direct`; a later different value is ignored — the run's provenance is fixed at creation), and passes `--via <recorded> --model <sessionModel(repoRoot) or omitted when null>` on all three `verdict.js` passes. (AC-20260901-02-4) | The driver's flag parse is pull-based (`flag('--via')`), so the addition is one read; sidecar recording makes a resumed session report the same `via` the run started with. |
| D5 | `spec-build-driver.js` accepts the same `--via` flag with the same creation-time recording, and writes `via` and `model` (via `sessionModel(repoRoot)`) onto the build row after `tier`. (AC-20260901-02-5) | Symmetric provenance; the build row is script-written since sibling 01. |
| D6 | `.claude/spec-session.json` is gitignored: `init-gen.js`'s `IGNORE_ENTRIES` gains it, and this repo's `.gitignore` gains the line. (AC-20260901-02-7) | A per-session scratch file must never ride a close commit — the 7.45.0 sidecar class. |
| D7 | `spec/entrypoints.json` gains the hook script's row (entry point `spec/hooks/hooks.json`) and `lib/session-stamp.js`'s consumers; `tests/consistency/entrypoints.test.js`'s live hook-path pin goes four → five in place, retagged. (AC-20260901-02-8) | The exhaustive-pin class (host § Gotchas): updated in place, never weakened, one waive line at review. |
| D8 | Escape rows keep their own `via` (`commit\|manual`) untouched; the two keys share a name across stages and nothing else. `[no-ac: no behavior changes on escape rows; brief 19 owns escape-row validation]` | Brief 18 names the key; a rename here would touch escape.md and the fleet reader's fixtures for no measurement gain. Brief 19's per-stage validator is where the enum split lives. |
| D9 | Concurrency is last-writer-wins per root: two sessions prompting `/spec:` in the same root overwrite one stamp; the row may then carry the sibling's model. Recorded, not solved. `[no-ac: documented limitation — the aggregate A/B tolerates it; no observable to assert]` | A per-session stamp would need the driver to know its session id, which is exactly what it lacks. Concurrent sessions in one root are rare and worktree builds get their own `cwd` and stamp. |
| D10 | `build_base` is `c0113441b316a1de01a42534df0e1f876c7b88dd` — sibling 01's review-close commit, this spec's true pre-image — not the moving ref `main`, which sibling 01 has since outrun on this branch. Recorded as a JJ ruling 2026-09-01: spec 02's review panel covers spec 02's changes only. `[no-ac: build-range identity, not a runtime observable; red-check's pre-image purity refusal is the executed evidence]` | With `main` the red-check pre-image-purity leg refuses (six non-tests File Plan paths already differ) and review would re-judge sibling 01's six approved files. `merge-back.sh branch-for` derives the merge target independently, so a sha here changes nothing about merge-back. |
| D11 | `spec/entrypoints.json` gains the hook script's row ONLY; D7's second clause (a manifest row for `lib/session-stamp.js`) is withdrawn — the manifest is an entry-point inventory whose executable scan deliberately excludes `spec/scripts/lib/`, and `tests/consistency/entrypoints.test.js`'s AC-20260820-04-1 pins `manifest keys === scanned executables` exactly. `[no-ac: withdrawal of an addition; AC-20260901-02-8 already pins the hook row, and AC-20260820-04-1 pins the absence]` | Adding a `lib/` row made the live bijection pin read 41 vs 40 with no legal fix short of weakening it, and that pin is never weakened (D7's own rationale). `lib/session-stamp.js`'s consumers are recorded in its own header comment instead. |
| D12 | `tests/consistency/red-fixture-coverage.test.js` is added to scope: its `HOOK_HANDLERS` registry gains a `spec-session-stamp.sh` handler that proves the hook ENGAGES (a planted `/spec:` prompt writes the stamp; a planted non-`/spec:` prompt writes nothing; both exit 0 with empty stdout) rather than that it BLOCKS. `[no-ac: scope addition carrying no new observable; the engagement it asserts is AC-20260901-02-1's contract]` | The guard fails closed for any hook it has not been taught, and D1 makes "can block on a planted violation" unprovable for this one — asserting blocking would be false, and exempting it would leave the hook shipped with nothing proving it works. Derived in-session 2026-09-01 rather than escalated: the hook's contract already fixes the only defensible fixture. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-session-stamp.sh | CREATE | scripts | D1: never-blocking stamp hook; header per host § Worker Rules; exit code 0 only |
| spec/hooks/hooks.json | MODIFY | doctrine | D1: third `UserPromptSubmit` arm |
| spec/scripts/lib/session-stamp.js | CREATE | scripts | D2: `readSessionStamp`, `sessionModel` |
| spec/scripts/verdict.js | MODIFY | scripts | D3: `--via`, `--model`; row keys after `tier`; refusal matrix in the header |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D4: `--via` flag, sidecar record, both flags on every verdict pass |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | D5: `--via` flag, `via`/`model` on the row |
| spec/scripts/init-gen.js | MODIFY | scripts | D6: `IGNORE_ENTRIES` gains `.claude/spec-session.json` |
| .gitignore | MODIFY | other | D6: add `.claude/spec-session.json` |
| spec/entrypoints.json | MODIFY | doctrine | D7: hook row + lib consumers |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | version bump target 7.49.0 + changelog paragraph (next free version if taken) |
| tests/provenance/provenance.test.js | CREATE | tests | AC-20260901-02-1, AC-20260901-02-2, AC-20260901-02-3, AC-20260901-02-6 |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260901-02-4 (new test) + the byte-identity test re-invokes `verdict.js` with `--via`/`--model` as recorded |
| tests/build/build-driver.test.js | MODIFY | tests | AC-20260901-02-5 |
| tests/consistency/entrypoints.test.js | MODIFY | tests | AC-20260901-02-8 (four → five hook paths, in place) |
| tests/init-gen/generate.test.js | MODIFY | tests | AC-20260901-02-7 |
| tests/consistency/red-fixture-coverage.test.js | MODIFY | tests | D12: `HOOK_HANDLERS` gains a `spec-session-stamp.sh` engagement fixture (added to scope at build) |

## Contracts

```
spec/scripts/spec-session-stamp.sh          (UserPromptSubmit; stdin = hook JSON)
  prompt starts with "/spec:"  -> write <cwd>/.claude/spec-session.json atomically:
      {"session_id":"<id>","transcript_path":"<abs path>","cwd":"<abs path>","ts":"<ISO-8601>"}
  anything else, or any failure -> exit 0, no output, no write
  Exit codes: 0 (always — a stamp must never block a prompt)

lib/session-stamp.js
  readSessionStamp(root) -> { sessionId, transcriptPath, cwd, ts } | null
  sessionModel(root)     -> string | null     // last assistant message.model in the transcript tail

verdict.js (review profile)
  --via loop|direct     default direct; other value -> exit 2 usage
  --model <id>          default null
  row: {"ts","spec","stage":"review","tier","via":"loop"|"direct","model":"<id>"|null,"runId",...}
  --profile release with --via or --model -> exit 2

spec-review-driver.js <spec> [--via loop|direct] [...]
  review-state.json gains: via: "loop"|"direct"   (set once at creation)
spec-build-driver.js  <spec> [--via loop|direct] [...]
  build-state.json gains:  via: "loop"|"direct"
  build row: {"ts","spec","stage":"build","tier","via","model","runId",...}

hooks.json UserPromptSubmit arms, in order: spec-state-gate.sh, genesis-state-gate.sh, spec-session-stamp.sh
```

## Behavior

Transcript tail scan (D2): read the last 512 KiB of `transcript_path` (whole file when
smaller), split on newlines, walk backwards, JSON-parse each line, return the first whose
`type === "assistant"` and whose `message.model` is a non-empty string. A partial first line
(cut by the tail window) parses as garbage and is skipped like any other unparseable line.

| Stamp on disk | Transcript | `sessionModel` |
|---|---|---|
| absent | — | `null` |
| present | file missing | `null` |
| present | last assistant line `{"type":"assistant","message":{"model":"claude-opus-5",…}}` | `"claude-opus-5"` |
| present | only user/system lines | `null` |

## Acceptance Criteria

- **AC-20260901-02-1**: WHEN the hook receives stdin `{"prompt":"/spec:build specs/x.md","session_id":"s1","transcript_path":"/t/x.jsonl","cwd":"<root>"}` THE SYSTEM SHALL exit 0 with empty stdout and write `<root>/.claude/spec-session.json` containing `"session_id":"s1"`, `"transcript_path":"/t/x.jsonl"`, `"cwd":"<root>"`, and an ISO-8601 `ts`; WHEN the prompt is `git status` or stdin is `not json` or `<root>/.claude` is not writable THE SYSTEM SHALL exit 0 and write nothing → `tests/provenance/provenance.test.js`
- **AC-20260901-02-2**: WHEN `sessionModel(root)` runs against a stamp whose transcript's last assistant line carries `message.model: "claude-opus-5"` after a later user line THE SYSTEM SHALL return `"claude-opus-5"`; WHEN the stamp is absent, the transcript is missing, or it holds no assistant line THE SYSTEM SHALL return `null` without throwing → `tests/provenance/provenance.test.js`
- **AC-20260901-02-3**: WHEN `verdict.js` runs a review-profile ledger pass with `--via loop --model claude-opus-5` THE SYSTEM SHALL print a row whose key order begins `ts, spec, stage, tier, via, model, runId` with `"via":"loop","model":"claude-opus-5"`; WHEN both flags are absent THE SYSTEM SHALL print `"via":"direct","model":null`; WHEN `--via manual` is passed, or `--via loop` with `--profile release`, THE SYSTEM SHALL exit 2 with no row → `tests/provenance/provenance.test.js`
- **AC-20260901-02-4**: WHEN the review driver is first invoked with `--via loop` and later driven to a CLEAN close with a stamp whose transcript ends in an assistant line with `message.model: "claude-sonnet-5"` THE SYSTEM SHALL record `via: "loop"` in `review-state.json` at creation and append a CLEAN row carrying `"via":"loop","model":"claude-sonnet-5"`; WHEN invoked without `--via` and without a stamp THE SYSTEM SHALL append `"via":"direct","model":null` → `tests/review/review-driver.test.js`
- **AC-20260901-02-5**: WHEN the build driver reaches DONE on a host with a stamp whose transcript ends in an assistant line with `message.model: "claude-opus-5"` after being created with `--via loop` THE SYSTEM SHALL append a build row whose keys after `tier` begin `via, model` with `"via":"loop","model":"claude-opus-5"`; without `--via` and without a stamp → `"via":"direct","model":null` → `tests/build/build-driver.test.js`
- **AC-20260901-02-6**: WHEN `verdict.js` runs any existing review-profile ledger pass without `--via` or `--model` THE SYSTEM SHALL CONTINUE TO emit every pre-existing field with its existing value and position (`via`/`model` are the only additions, placed after `tier`) → `tests/provenance/provenance.test.js` (a direct pass with and without the flags, diffed minus `ts`/`runId`)
- **AC-20260901-02-7**: WHEN `init-gen.js generate` runs on a host THE SYSTEM SHALL leave `git check-ignore .claude/spec-session.json` exiting 0, the line appearing once across two runs → `tests/init-gen/generate.test.js`
- **AC-20260901-02-8**: WHEN `tests/consistency/entrypoints.test.js` parses `spec/hooks/hooks.json` THE SYSTEM SHALL find exactly five live hook script paths, `spec/scripts/spec-session-stamp.sh` among them, each resolving to an existing file → `tests/consistency/entrypoints.test.js` (the existing exact-count pin, updated in place)

## Assumptions (escalation triggers)

- A1: Executed 2026-09-01 — a real `claude -p` run with a temporary `UserPromptSubmit` hook (`cat > hook-input.json`) received stdin keys `session_id`, `transcript_path`, `cwd`, `prompt_id`, `permission_mode`, `hook_event_name`, `prompt` (no `model`); the transcript at that `transcript_path` ended in an assistant line with `message.model: "claude-haiku-4-5-20251001"`, the model the run was given — **if false:** D1 writes whatever fields exist and D2 returns `null`; nothing refuses.
- A2: Executed 2026-09-01 — across the 15 most recent transcripts under `~/.claude/projects/<this repo>/`, every `"type":"assistant"` line carries `message.model`, with four distinct ids observed (`claude-fable-5`, `claude-fable-5-1`, `claude-opus-5`, `claude-sonnet-5`) — **if false (format change):** `sessionModel` returns `null`; the row carries `model: null`; the A/B loses the model axis, never the `via` axis.
- A3: Executed 2026-09-01 — `node spec/scripts/verdict.js --via loop` exits 2 (unknown flag → usage), so the flags must be added to its parse — **if false:** unchanged plan, one fewer refusal to write.
- A4: Executed 2026-09-01 — `/clear` starts a new session id and a new transcript file (seven consecutive transcripts on this machine each begin with the `/clear` command entry under a fresh UUID, and the prior file ends with the same entry), so a stamp written after a `/clear` names the new session — the property sibling 03's checkpoint enforcement rests on — **if false:** 03's checkpoint degrades to advisory; this spec is unaffected.
- A5: The review driver's `flag(name)` helper reads any `--name value` pair without an allowlist, and `handleMergeStrategy` reads its token positionally at `argv[markIdx + 2]` — `--via` is placed by callers AFTER a mark's own arguments — **if false:** the worker returns `blocked`; the flag position is decided here, never improvised.
- A6: `tests/review/review-driver.test.js`'s byte-identity test (AC-20260820-07-2) re-invokes `verdict.js` with the row's recorded flags and `deepStrictEqual`s minus `ts` — adding `--via`/`--model` to the driver's passes requires that test to pass the same two flags (from the row's own `via`/`model`) — **if false:** STOP, ask the user; the byte-identity pin is never weakened.
- A7: `hooks.json`'s `UserPromptSubmit` arms run independently — a third arm that exits 0 with no stdout injects nothing and blocks nothing — **if false (a later arm cannot run after an exit-2 arm):** irrelevant: the stamp arm is placed last and the two gate arms block only on their own refusals.

## Rationale

**Why a hook + file rather than an environment variable.** The session model is not in the
shell environment and no documented route exposes it to a subprocess (Claude Code hooks,
env-vars, and statusline docs, read 2026-09-01). The only carriers are hook stdin
(`session_id`, `transcript_path`) and the transcript itself. A prompt hook that files those
two strings, and a library that reads the model off the transcript at row-write time, is the
whole mechanism; every failure mode is a `null`, never a block.

**Why the model is read at row time, not at prompt time.** At the first prompt after a
`/clear` the new transcript has no assistant line yet; by the time a driver writes a row the
session has spoken many times. Reading late is what makes the stamp usable exactly at the
loop's checkpoints.

**Why `via` and not a new key name.** Brief 18 names it, and the fleet query in sibling 03
reads it. Escape rows' `via: commit|manual` is a different stage; brief 19's validator is
where per-stage enums live. Renaming here would spend a File Plan row on escape.md for no
measurement.

**Why default `direct`.** Every existing `verdict.js` caller and test keeps working; only
the byte-identity test learns the flags because the driver now always passes them. `loop`
appears only when sibling 03's outer loop passes it.

**What is fragile.** The transcript format is undocumented and may change; A2 fixes the
fallback (`null`). Last-writer-wins per root (D9) can mislabel a row's model when two sessions
interleave in one root; the `via` axis is unaffected because it comes from the invoking
command, not the stamp.

**Deviations folded at review close 2026-09-01.** Two entries were recurring-shaped and folded
into the host rules § Gotchas: D10's `build_base` correction (a moving ref planned as the base
of a chained sibling series) extends the stale-`diff_base` entry as its second trigger, and
D11/D12's two exhaustive-live-file-pin collisions (`red-fixture-coverage.test.js`'s
`HOOK_HANDLERS` guard; `entrypoints.json`'s manifest-vs-executables count, where a
`spec/scripts/lib/` row is unrepresentable because the executable scan excludes that directory)
extend the exhaustive-pin entry as its fifth and sixth recurrences. Neither addition changed the
Gotchas entry count. The remaining three were one-offs, recorded here:

- The test author repaired a fixture defect in `tests/provenance/provenance.test.js` caught by
  the coordinator's red-attribution pass: `manifestFixture()` wrote a single green `gate` row
  against a minimal workflow object, missing seven of `verdict.js`'s eight required `REVIEW_LEGS`
  rows, so the three `status === 0` tests derived `UNVERIFIED` and failed on the verdict word
  rather than on the `--via`/`--model` contract. Replaced with the eight-leg-green fixture and
  full workflow shape `tests/review/verdict.test.js` already uses, confirmed by direct execution
  against an unmodified `verdict.js` that the fixture alone reaches CLEAN.
- The orchestrator applied D6's one-line `.gitignore` row directly rather than dispatching a
  `general-purpose` worker for it — the wave's whole file set was one literal line with no design
  question. Recorded as `--workers 0` on the ledger row so the count stays honest.
- Agent-memory disposal at this close: the sweep surfaced eight notes by content reference and
  the spec's own diff touched none. All eight were judged still true against the current scripts
  and carried, with `reviewed: 2026-09-01` written into each.

## Canonical Delta

Append to `docs/canonical/build-integrity.md` a section `## Run provenance`:

Build and review rows carry `via` (`loop` when produced by `/spec:build`'s unified loop,
`direct` when produced by the stage's own command) and `model` (the session model id, or
`null`). `via` comes from the invoking command's `--via` flag and is fixed at sidecar creation;
`model` is derived at row-write time by `lib/session-stamp.js` from the transcript named in
`.claude/spec-session.json`, a per-root, gitignored, last-writer-wins stamp that the
never-blocking `spec-session-stamp.sh` prompt hook writes on every `/spec:` prompt. The
transcript format is internal to Claude Code; the reader fails soft to `null`. The session
model is deliberately not read at prompt time — the transcript is empty right after a
`/clear`.
