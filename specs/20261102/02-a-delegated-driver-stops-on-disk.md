---
date: 2026-11-02
status: implementing
tier: critical
area: delegated-stops
breaking: false
depends_on: []
brief: 32
spiked: 2026-11-02
open_markers: 0
diff_base: bbbdc63b66bdc8ec0074239ef704d4faf5548962
---

# A delegated driver stops on disk

## Goal

A build or review driver that runs inside a Claude Code sub-agent has no AskUserQuestion tool, yet
today every judgment stop prints `Ask ONE AskUserQuestion` and leaves the sub-agent to improvise.
After this spec, a driver that detects a child session writes the question to one file at the
lane's repo root — question, options with consequences, recommended pick, the resume command per
option — prints a `PENDING_QUESTION` stop and exits; a bare re-run prints the resume step once the
file carries an answer, prints STOP when it carries a dismissal, and waits otherwise. A delegated
review also stops at `MERGE_READY` instead of printing the merge mark, so a parent session merges
from the main root. The same file shape serves `/spec:run`'s Step 0 and `/spec:fix`'s three asks,
and `question-style-gate.js` can check the file the way it checks a live call. Done means a session
that never delegates is byte-for-byte unchanged, and a sub-agent running any driver can only ever
hand a question up, never answer it.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/pending-question.js` — module and CLI. Module exports `isDelegated()` (true iff `process.env.CLAUDE_CODE_CHILD_SESSION` is a non-empty string), `pendingPath(root)` (`<root>/.claude/pending-question.json`), `writePending(root, doc)`, `readPending(root)` (parsed object or `null`), `consumePending(root)` (unlink; no error when absent), `validate(doc)` (`[]` or one finding string per defect: schema (Contracts) plus `question-style-gate.js`'s exported `check` over `{tool_input:{questions}}`). CLI: `write --root <dir> --file <doc.json>` (validate, exit 2 printing each finding, else write, print the path, exit 0; refuses with exit 2 `a question is already pending: <path>` when one exists), `show --root <dir>` (print the file, exit 0; exit 1 `no pending question` when absent), `answer --root <dir> --id <qid> --label <label> --by user\|standing` (sets `answers[qid]`; exit 2 when the id or label is unknown or `--by` is outside the enum), `dismiss --root <dir>` (sets `dismissed`), `consume --root <dir>`. (AC-20261102-02-1, AC-20261102-02-2, AC-20261102-02-3) | One writer and one reader for the file both drivers, two commands and the fan-out orchestrator share; the env marker is the harness's own child-session signal (A1), so a manual sub-agent run is delegated with no flag to forget. Rejected: a `--delegated` flag (the worker model would have to carry it through every driver call). |
| D2 | `spec/scripts/question-style-gate.js` gains `--file <path>`: reads the file instead of stdin, runs tier 1 (`check`) over `{tool_input:{questions: doc.questions}}`, prints `BLOCKED — …` with the findings and exits 2 on any, else exits 0 silently; the haiku judge never runs in this mode; `check` is exported (`module.exports = { check }`) and the hook path (`require.main === module`, no `--file`) is unchanged. (AC-20261102-02-4, AC-20261102-02-5) | The sidecar is relayed verbatim as the live call, so it is held to the same floor by the same code (core § Question Style); exporting `check` keeps one reader. |
| D3 | `spec/scripts/spec-review-driver.js` — delegated forms, taken only when `isDelegated()`: **STOPPED** (round unspent) writes kind `repair-round` with options `run one in-session repair round (Recommended)` → resume `node <driver> <spec> --mark repair-round`, `queue /spec:fix and stop` → resume `stop` with `then` the spec-queue add line, `abandon the review` → resume `stop` with `then` the delete-sidecar line; the spent-round text is unchanged (no question there). **DISPOSITIONS** prints the disposer dispatch as today with the waive/reject sentence replaced by `write the return file as the disposer produced it, then:`; `--mark dispositions --file <return.json>` when delegated and the return holds ≥1 entry whose `recommended` is `waive` or `reject` with no `final` → writes kind `dispositions`, one question per such entry (`id` = the entry's `ref`; options `accept <recommended> (Recommended)`, `fix instead`, `<the other of waive/reject> instead`), resume `node <driver> <spec> --mark dispositions --file <return.json>`, prints `PENDING_QUESTION`, exits 0, consumes nothing and changes no mark; the same mark with every such entry answered copies each answer into the return file (`final` = the chosen fate; `overriddenBy:"user"`, `overrideReason:"answered through the delegated stop by <by>"` when it differs from `recommended`), consumes the file and proceeds as today. **ESCALATE** writes kind `review-escalate` with options `waive or reject everything through the disposer (Recommended)` → resume the dispositions mark line, `abandon` → `stop` + the delete line, `re-plan` → `stop` + the queue line. **MERGE** when delegated prints `## MERGE_READY — <specRel> is closed on <source>; the parent session runs the merge from <mainRoot>` and exits 0 before `inspect`; the merge-skipped arm is unchanged. (AC-20261102-02-6, AC-20261102-02-7, AC-20261102-02-8, AC-20261102-02-9, AC-20261102-02-10, AC-20261102-02-17, AC-20261102-02-18) | Every ask site keeps its in-session text and gains one file-shaped twin; the dispositions answers land where the driver already validates `final`/`overriddenBy` (the mark's own refusal keeps the one-override rule); MERGE needs the main root's CWD, which only the parent has. |
| D4 | `spec/scripts/spec-build-driver.js` — delegated forms: **RED_FINDINGS** critical-tier unsanctioned-green writes kind `red-findings` with options `remove the AC-ID mention (Recommended)`, `rewrite the test red`, `pause the build` → resumes `edit then node <driver> <spec>`, same, and `stop`; **ESCALATE** (no choice yet) writes kind `build-escalate` with the four options mapped to `node <driver> <spec> --mark escalate-choice <re-arm\|cold\|park\|amend>` (the Recommended marker follows `escalateRecommendation().pick` as today); the parked and amend texts are unchanged. (AC-20261102-02-11, AC-20261102-02-12, AC-20261102-02-19) | The two build asks map one-to-one onto marks that already exist; nothing else in the build loop asks. |
| D5 | Bare-run contract shared by both drivers, evaluated before any other state: a pending file at `repoRoot` with no `answers` and no `dismissed` → print `## PENDING_QUESTION — waiting for the parent session: <path>` and exit 0 (idempotent; nothing re-asked, no mark changed); with `dismissed` → consume the file, set `marks.dismissedStop = {kind, at}` in the stage sidecar and print `## STOPPED — the question was dismissed; the run ends (core § Decisions)` exit 0 (every later bare run re-prints it from the mark); with every question answered → print `## Step: resume — <kind>` listing each `<qid>: <label> (by <by>)` and the chosen option's `resume` line (or `stop` plus its `then` line) and consume the file in the same invocation, recording `marks.answered = [{kind, answers, at}]` (appended). A partially answered file waits. (AC-20261102-02-13, AC-20261102-02-14, AC-20261102-02-15) | One re-entrant rule for every kind, derived from disk so a `/clear`ed worker and a cold re-run agree; consumption at print time keeps the file a transient (core § On-Disk Handoff) and makes "terminal means gone" literal. |
| D6 | `spec/doctrine/core.md` gains `## Delegated Stops` after § Decisions: a driver or command running in a child session (the harness sets `CLAUDE_CODE_CHILD_SESSION`; the sub-agent has no AskUserQuestion tool) never asks — it writes `.claude/pending-question.json` at its repo root through `pending-question.js`, prints `PENDING_QUESTION`, and stops; only the parent session writes an answer (`by: user` from a live AskUserQuestion it asked, `by: standing` from an answer the user gave that session up front), the worker never does; a dismissal is a STOP exactly as § Decisions; a delegated review ends at `MERGE_READY` and the parent merges from the main root. `[no-ac: doctrine prose; tests/consistency/prose-pins pins the heading and the file name]` | The contract lives once, in core, where every stage's `shared-for` can slice it; the three enforcement points (tool absence, driver shape, single writer) are named so a reader knows why no hook is needed. |
| D7 | `spec/commands/run.md` Step 0 gains a derived skip ahead of the worktree-failure ask: when `git rev-parse --show-toplevel` differs from `merge-back.sh root` AND the current branch equals `merge-back.sh branch-for <spec>` → skip, printing `📌 Auto-picked in place — this session already sits in a worktree on the spec's branch (veto anytime)`; and when the session is delegated (core § Delegated Stops) a worktree failure is a STOP printing the failure text, never a question. `spec/doctrine/stages/stage-build.md` and `stage-review.md` each add one sentence at their first `AskUserQuestion` mention: "in a child session the driver writes the question instead — core § Delegated Stops". `spec/bin/spec-paths` adds `Delegated Stops` to the `run`, `build`, `review` and `fix` section lists. `[no-ac: doctrine prose; tests/consistency/prose-pins pins the skip line and the section names]` | A lane sub-agent arrives already isolated on the lane branch (brief 32 § Current state), and enter-worktree would refuse to create a second worktree for a branch in use (A3); a worktree problem has no relay-shaped answer. |
| D8 | `spec/commands/fix.md`: steps 1 (dirty tree), 4 (decisions) and 6 (dispositions) each gain the delegated twin — write the question document to a scratch file and run `node "$(spec-paths pending-question)" write --root . --file <doc.json>` with kinds `fix-dirty-tree`, `fix-decisions`, `fix-dispositions`, then stop; on resume read `show`, apply, `consume`. `[no-ac: command prose; tests/consistency/prose-pins pins the three kinds]` | `/spec:fix` is prose, not a driver, so the command names the CLI it uses; the kinds are in the closed set so a parent can match standing answers. |
| D9 | `tests/helpers.js` `runNode` and `runBash` delete `CLAUDE_CODE_CHILD_SESSION` from the child env unless the caller's `opts.env` sets it (`env: {...process.env, CLAUDE_CODE_CHILD_SESSION: undefined, ...(opts.env \|\| {})}`), so the suite's in-session expectations hold when the gate itself runs inside a lane sub-agent; delegated tests pass `env: {CLAUDE_CODE_CHILD_SESSION: '1'}`. (AC-20261102-02-16) | The build driver runs the gate as a child of a lane worker, where the marker is set (A1); without this every existing "Ask ONE AskUserQuestion" pin reds inside a lane. |
| D10 | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"`. `[no-ac: node scripts/plugin-bump.js --check in the gate is the oracle]` | Behaviour change under `spec/` (pipeline rules § Planning). |
| D11 | `spec/entrypoints.json` gains `"spec/scripts/pending-question.js": {"entryPoints": ["spec/scripts/spec-review-driver.js", "spec/scripts/spec-build-driver.js", "spec/commands/fix.md"]}` and `spec/bin/spec-paths` gains the `pending-question` key. `[no-ac: tests/consistency/entrypoints.test.js and tests/spec-paths.test.js's in-place key list are the oracles]` | New-surface checklist (pipeline rules § Planning). |
| D12 | `tests/consistency/read-load.test.js`'s `SHARED_FOR.run` row gains `'Delegated Stops'` between `'Decisions'` and `'Question Style'`. User ruling (by user, 2026-11-02, add to scope) on the gate line `not ok AC-20260908-06-3 / AC-20261024-04-5: spec-paths shared-for prints exactly the pinned ## section list` — D7's run-list addition reds that pin. `[no-ac: the pin itself is the oracle]` | The pin exists to make a section-list change a deliberate table edit; D7 is that deliberate change. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/pending-question.js | CREATE | scripts | module + CLI: `isDelegated`, path/read/write/consume, `validate` through the gate's `check`; subcommands write/show/answer/dismiss/consume (D1); `no dependency change` |
| spec/scripts/question-style-gate.js | MODIFY | scripts | `--file <path>` tier-1-only mode; `check` exported; hook path unchanged (D2) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | delegated STOPPED / DISPOSITIONS mark / ESCALATE / MERGE_READY; the shared bare-run pending contract (D3, D5) |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | delegated RED_FINDINGS / ESCALATE; the shared bare-run pending contract (D4, D5) |
| spec/bin/spec-paths | MODIFY | scripts | `pending-question` key; `Delegated Stops` in the run/build/review/fix section lists (D7, D11) |
| spec/doctrine/core.md | MODIFY | doctrine | `## Delegated Stops` (D6) |
| spec/commands/run.md | MODIFY | doctrine | Step 0 already-in-worktree skip; delegated worktree failure is a STOP (D7) |
| spec/doctrine/stages/stage-build.md | MODIFY | doctrine | one pointer sentence at the first ask (D7) |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | one pointer sentence at the first ask (D7) |
| spec/commands/fix.md | MODIFY | doctrine | delegated twins for steps 1, 4, 6 through the CLI (D8) |
| spec/entrypoints.json | MODIFY | other | the new script's entry points (D11) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D10) |
| tests/helpers.js | MODIFY | tests | AC-20261102-02-16; `runNode`/`runBash` strip the child marker unless set (D9) |
| tests/delegated/pending-question.test.js | CREATE | tests | AC-20261102-02-1, AC-20261102-02-2, AC-20261102-02-3 |
| tests/question-style-gate.test.js | MODIFY | tests | AC-20261102-02-4, AC-20261102-02-5 |
| tests/review/delegated-stops.test.js | CREATE | tests | AC-20261102-02-6, AC-20261102-02-7, AC-20261102-02-8, AC-20261102-02-9, AC-20261102-02-10, AC-20261102-02-13, AC-20261102-02-14, AC-20261102-02-15, AC-20261102-02-17, AC-20261102-02-18 |
| tests/build/delegated-stops.test.js | CREATE | tests | AC-20261102-02-11, AC-20261102-02-12, AC-20261102-02-19 |
| tests/consistency/prose-pins.test.js | MODIFY | tests | reference pins for D6, D7, D8 (heading, file name, skip line, the three fix kinds) |
| tests/consistency/read-load.test.js | MODIFY | tests | `SHARED_FOR.run` gains `Delegated Stops` (D12) |

## Contracts

`.claude/pending-question.json` (D1) — one per repo root, present only while a question is open:

```jsonc
{
  "schemaVersion": 1,
  "kind": "repair-round",            // closed set: repair-round | dispositions | review-escalate |
                                     //   red-findings | build-escalate | fix-dirty-tree |
                                     //   fix-decisions | fix-dispositions
  "stage": "review",                 // build | review | fix
  "state": "STOPPED",                // the driver state (or fix step) that wrote it
  "spec": "specs/20261102/02-x.md",  // repo-relative; a fix lane names its queue id instead
  "writtenAt": "2026-11-02T10:00:00Z",
  "questions": [{
    "id": "q1",                      // unique within the file; dispositions use the entry ref
    "header": "Review stop",         // ≤ 12 chars, as AskUserQuestion's header
    "question": "A blocking review leg went red. What should the lane do?",
    "options": [
      { "label": "run one in-session repair round (Recommended)",
        "description": "The lane fixes the failing leg through the review fix seat and re-runs the legs; red again lands here with the round spent",
        "resume": "node /abs/spec-review-driver.js specs/20261102/02-x.md --mark repair-round" },
      { "label": "queue /spec:fix and stop",
        "description": "The review ends; the repair becomes the queue's top item",
        "resume": "stop",
        "then": "node \"$(spec-paths spec-queue)\" add \"specs/20261102/02-x.md: review stopped, blocking leg red\" --lane fix --top" }
    ]
  }],
  "answers": null,                   // null until the parent answers; then {"q1": {"label": "...", "by": "user"|"standing", "at": ISO}}
  "dismissed": null                  // null, or {"at": ISO}
}
```

`validate(doc)` findings (D1): `schemaVersion must be 1`, `kind "<k>" is not in the closed set`,
`questions must be a non-empty array`, `question <id>: duplicate id`, `option "<label>": resume must
be a command or "stop"`, plus every tier-1 finding `check` returns (same wording as the hook).

`pending-question.js` CLI (D1):

```
write   --root <dir> --file <doc.json>          → prints <dir>/.claude/pending-question.json; exit 2 on findings or an existing file
show    --root <dir>                            → prints the file; exit 1 when absent
answer  --root <dir> --id <qid> --label <label> --by user|standing
dismiss --root <dir>
consume --root <dir>
Exit codes: 0 done · 1 nothing pending (show) · 2 usage, validation, unknown id/label, already pending
```

`question-style-gate.js --file <path>` (D2): exit 0 silent, or exit 2 with the hook's `BLOCKED —`
block; the judge never runs.

Driver stop lines (D3, D4, D5), each the first line of the step body:

```
## PENDING_QUESTION — <kind> written to <abs path>; the lane stops here and the parent session relays it
## PENDING_QUESTION — waiting for the parent session: <abs path>
## Step: resume — <kind>
## STOPPED — the question was dismissed; the run ends (core § Decisions)
## MERGE_READY — <specRel> is closed on <source>; the parent session runs the merge from <mainRoot>
```

Stage sidecar marks added (D5): `marks.answered` (array of `{kind, answers, at}`),
`marks.dismissedStop` (`{kind, at}`).

## Behavior

- **Detection:** `isDelegated()` is the only switch; every delegated branch is reached only through it,
  and a test or a user clears the variable to get the in-session text.
- **STOPPED (delegated, round unspent):** the step prints the red legs and the ledger line as today,
  then writes the `repair-round` file and prints the `PENDING_QUESTION` line in place of the
  `Ask ONE AskUserQuestion` block. The next bare run prints `waiting` until the parent answers.
- **Answered repair-round:** bare run prints `## Step: resume — repair-round`, `q1: run one in-session
  repair round (Recommended) (by user)`, then the resume command; the file is gone after that print; the
  worker runs the mark; `--mark repair-round` behaves exactly as today.
- **Answered with `stop`:** the resume step prints `stop` and the option's `then` line; the lane ends.
- **DISPOSITIONS (delegated):** the dispatch step is printed as today minus the ask sentence; the mark
  with unanswered waive/reject entries writes one `dispositions` file whose questions are the entries
  (`id` = `ref`), and the parent may relay them four at a time; the mark re-run after every answer
  rewrites the return file (`final`, `overriddenBy`, `overrideReason` when overridden) and proceeds.
- **MERGE (delegated):** `MERGE_READY` and exit 0 — no `inspect`, no mark line, no prototype ask (the
  parent's own bare MERGE run from the main root asks it in session, unchanged).
- **Non-delegated:** every printed text in both drivers is byte-for-byte today's; no file is written.
- **Dismissal:** consumed on sight; the stage sidecar remembers it; the lane re-prints STOPPED forever
  until the sidecar is deleted, exactly like today's spent-round exit.

## Acceptance Criteria

- **AC-20261102-02-1**: WHEN `pending-question.js write --root <dir> --file <doc.json>` runs with a
  valid document THE SYSTEM SHALL write `<dir>/.claude/pending-question.json` byte-equal to the
  document plus `"answers": null, "dismissed": null` (e.g. the Contracts example → the printed path,
  exit 0), and a second `write` while that file exists SHALL exit 2 with stderr
  `pending-question: a question is already pending: <path>` → writes tests/delegated/pending-question.test.js
- **AC-20261102-02-2**: WHEN `write` runs with a document whose `kind` is `"coffee"`, or whose option
  description is `"ok"`, or whose two questions share `id` `"q1"` THE SYSTEM SHALL exit 2 printing one
  line per finding (e.g. `kind "coffee" is not in the closed set`, `option "ok": description must state
  the consequence of picking it — …`, `question q1: duplicate id`) and write nothing
  → writes tests/delegated/pending-question.test.js
- **AC-20261102-02-3**: WHEN `answer --root <dir> --id q1 --label "queue /spec:fix and stop" --by user`
  runs on a pending file THE SYSTEM SHALL set `answers.q1` to `{"label": "queue /spec:fix and stop",
  "by": "user", "at": <ISO>}` and exit 0; `--by robot` SHALL exit 2 naming the enum; `--id q9` SHALL exit
  2 `unknown question id q9`; `dismiss` SHALL set `dismissed.at`; `consume` SHALL remove the file and
  exit 0 even when it is already absent; `show` with no file SHALL exit 1 `no pending question`
  → writes tests/delegated/pending-question.test.js
- **AC-20261102-02-4**: WHEN `question-style-gate.js --file <doc.json>` runs on a document whose option
  description is `"short"` THE SYSTEM SHALL exit 2 with stderr starting `BLOCKED — question not
  answerable by a busy reader` and containing `option "short-option": description must state the
  consequence`, and on the Contracts example SHALL exit 0 with empty stdout and stderr, never invoking
  the judge (a fake `claude` on PATH that writes an argv log stays unwritten)
  → writes tests/question-style-gate.test.js
- **AC-20261102-02-5**: WHEN the gate runs as the hook (stdin JSON, no `--file`) with an option whose
  description is `"short"` THE SYSTEM SHALL CONTINUE TO exit 2 with the `BLOCKED —` block
  → reuses tests/question-style-gate.test.js :: missing or too-short description blocks with rewrite guidance
- **AC-20261102-02-6**: WHEN the review driver reaches STOPPED with the repair round unspent and
  `CLAUDE_CODE_CHILD_SESSION=1` THE SYSTEM SHALL write `<worktree>/.claude/pending-question.json` with
  `kind: "repair-round"`, three options whose first label is `run one in-session repair round
  (Recommended)` and whose resume is `node <driver> <spec> --mark repair-round`, print
  `## PENDING_QUESTION — repair-round written to <path>` and no `AskUserQuestion`, and exit 0
  → writes tests/review/delegated-stops.test.js
- **AC-20261102-02-17**: WHEN the review driver reaches STOPPED with the repair round unspent and
  `CLAUDE_CODE_CHILD_SESSION` unset THE SYSTEM SHALL CONTINUE TO print `Ask ONE AskUserQuestion` with
  the three option lines and SHALL CONTINUE TO write no `.claude/pending-question.json` (e.g. the
  worktree's `.claude/` holds only the ledger after the run) → writes tests/review/delegated-stops.test.js
- **AC-20261102-02-7**: WHEN `--mark dispositions --file <return.json>` runs delegated with a return
  holding entries `s0` (`recommended: "waive"`, no `final`) and `s1` (`recommended: "fix"`) THE SYSTEM
  SHALL write a `dispositions` file with exactly one question (`id: "s0"`, options `accept waive
  (Recommended)`, `fix instead`, `reject instead`), print `PENDING_QUESTION`, leave `review-state.json`'s
  marks unchanged and exit 0; after `answer --id s0 --label "reject instead" --by user` the same mark
  SHALL rewrite `s0` in the return file to `final: "reject", overriddenBy: "user", overrideReason:
  "answered through the delegated stop by user"`, consume the pending file and proceed to the state
  today's mark reaches → writes tests/review/delegated-stops.test.js
- **AC-20261102-02-8**: WHEN the review driver reaches ESCALATE (iteration cap 2) delegated THE SYSTEM
  SHALL write kind `review-escalate` whose options are `waive or reject everything through the disposer
  (Recommended)` (resume = the dispositions mark line), `abandon` (resume `stop`, `then` names
  `<spec>.review`), `re-plan` (resume `stop`, `then` starts `node "$(spec-paths spec-queue)" add`)
  → writes tests/review/delegated-stops.test.js
- **AC-20261102-02-9**: WHEN a delegated review reaches MERGE with `spec/<stem>` existing at the main
  root THE SYSTEM SHALL print `## MERGE_READY — <specRel> is closed on spec/<stem>; the parent session
  runs the merge from <mainRoot>` and exit 0 without running `merge-back.sh inspect` (a fake
  `merge-back.sh` would log; the real one's RECOMMEND line is absent) and without setting
  `mergeConcluded` → writes tests/review/delegated-stops.test.js
- **AC-20261102-02-18**: WHEN a review reaches MERGE with `spec/<stem>` existing at the main root and
  `CLAUDE_CODE_CHILD_SESSION` unset THE SYSTEM SHALL CONTINUE TO print `## Step: merge strategy` with the
  `--mark merge-strategy` line (e.g. `RECOMMEND: ff-only` from `inspect` for a one-commit branch)
  → writes tests/review/delegated-stops.test.js
- **AC-20261102-02-10**: WHEN a review hits the merge-skipped arm (no `spec/<stem>` branch) with
  `CLAUDE_CODE_CHILD_SESSION=1` THE SYSTEM SHALL CONTINUE TO conclude to DONE with `MERGE skipped`
  (e.g. the DONE line carries `review ran on the originating branch — MERGE skipped`)
  → writes tests/review/delegated-stops.test.js
- **AC-20261102-02-11**: WHEN the build driver reaches ESCALATE with no `escalateChoice` and
  `CLAUDE_CODE_CHILD_SESSION=1` on gate logs `fail 9`, `fail 4`, `fail 2` THE SYSTEM SHALL write kind
  `build-escalate` with four options whose first label is `re-arm one more round (Recommended when
  shrinking)` and resume `node <driver> <spec> --mark escalate-choice re-arm`, the others mapping to
  `cold`, `park`, `amend`, print `PENDING_QUESTION`, and exit 0 → writes tests/build/delegated-stops.test.js
- **AC-20261102-02-19**: WHEN the build driver reaches ESCALATE with no `escalateChoice` and
  `CLAUDE_CODE_CHILD_SESSION` unset THE SYSTEM SHALL CONTINUE TO print `Ask ONE AskUserQuestion` with
  the four option lines and the `--mark escalate-choice <re-arm|cold|park|amend>` line, writing no
  pending file → writes tests/build/delegated-stops.test.js
- **AC-20261102-02-12**: WHEN the build driver reaches RED_FINDINGS on a `tier: critical` spec with an
  unsanctioned-green file and the variable set THE SYSTEM SHALL write kind `red-findings` with options
  `remove the AC-ID mention (Recommended)` (resume `edit then node <driver> <spec>`), `rewrite the test
  red` (same), `pause the build` (`stop`) and print `PENDING_QUESTION`
  → writes tests/build/delegated-stops.test.js
- **AC-20261102-02-13**: WHEN either driver is re-run bare while its pending file has `answers: null` THE
  SYSTEM SHALL print `## PENDING_QUESTION — waiting for the parent session: <path>`, exit 0, and leave the
  file and the stage sidecar byte-identical (e.g. three consecutive bare runs → three identical outputs,
  one file) → writes tests/review/delegated-stops.test.js
- **AC-20261102-02-14**: WHEN a driver is re-run bare with every question answered THE SYSTEM SHALL
  print `## Step: resume — repair-round`, `q1: run one in-session repair round (Recommended) (by standing)`,
  the resume command line, remove the file in the same invocation, and append `{kind: "repair-round",
  answers: {...}, at}` to `marks.answered` in the stage sidecar; a following bare run SHALL print the
  state's normal step (STOPPED's text) with no `PENDING_QUESTION` line
  → writes tests/review/delegated-stops.test.js
- **AC-20261102-02-15**: WHEN a driver is re-run bare with `dismissed.at` set THE SYSTEM SHALL remove the
  file, set `marks.dismissedStop` to `{kind, at}` and print `## STOPPED — the question was dismissed;
  the run ends (core § Decisions)`; every later bare run SHALL print the same line; `--mark
  repair-round` after a dismissal SHALL exit 2 with stderr naming `dismissedStop` and the remedy
  `delete <sidecar> to restart` → writes tests/review/delegated-stops.test.js
- **AC-20261102-02-16**: WHEN `runNode` from `tests/helpers.js` runs any script while the test process
  has `CLAUDE_CODE_CHILD_SESSION=1` THE SYSTEM SHALL start the child without that variable (e.g. a
  script printing `process.env.CLAUDE_CODE_CHILD_SESSION` → `undefined`), and with `opts.env:
  {CLAUDE_CODE_CHILD_SESSION: '1'}` SHALL start it set → writes tests/delegated/pending-question.test.js

## Assumptions (escalation triggers)

- A1: Claude Code sets `CLAUDE_CODE_CHILD_SESSION` in every sub-agent spawned through the Agent tool
  and removes the AskUserQuestion tool from it — **executed 2026-11-02** in this repo: a
  worktree-isolated haiku probe and a plain haiku probe both printed `CLAUDE_CODE_CHILD_SESSION=<set>`
  and reported AskUserQuestion absent from both loaded and deferred tool lists (the docs at
  code.claude.com/docs/en/sub-agents say the first tool filter removes it). — **if false:** D1's
  `isDelegated()` also honours `SPEC_DELEGATED=1`, which the fan-out dispatch (spec 03) would export in
  its run line; the drivers are unchanged.
- A2: The child marker leaks into the host gate when a lane worker runs it (the gate is a child of the
  driver, which is a child of the worker's shell) — a prediction from A1's env listing, not executed.
  — **if false:** D9 is harmless and stays.
- A3: `git switch <branch>` from one worktree refuses a branch another worktree holds — **executed
  2026-11-02**, git 2.47.3: `fatal: 'spec/x' is already used by worktree at '<path>'` exit 128;
  `git switch -c <existing>` → `fatal: a branch named 'spec/x' already exists` exit 128; `git switch -c
  <new>` → exit 0. — **if false:** D7's skip stays (the branch test is the cheap guard) and run.md's
  existing failure ask covers the rest.
- A4: `question-style-gate.js`'s `check(input)` is a pure function of `input.tool_input.questions`
  (read at lines 97–122, no I/O) — **if false:** D2 wraps it so `--file` builds the same shape and the
  module export stays.
- A5: `--mark dispositions --file` already refuses a `final` that differs from `recommended` without
  `overriddenBy:"user"` and a non-blank `overrideReason` (read at lines 1625–1639), so D3's rewrite
  passes its own refusal — **if false:** the rewrite adds whatever the refusal demands; the one-override
  rule is never weakened.
- A6: No existing test pins the review or build driver's full step text at STOPPED, ESCALATE, MERGE or
  RED_FINDINGS with the child marker set, so D9 plus the unchanged in-session branches red nothing
  outside this File Plan — **if false:** that test enters the File Plan as a MODIFY row carrying its own
  `env`.

## Rationale

The user ran four lanes by hand with a prose rule ("never call AskUserQuestion; write the question
down and stop") and asked for the plugin to enforce it. The probes settled what enforcement means:
the harness already removes the tool from sub-agents, so the only thing left to enforce is the
driver's *shape* — it must never print an instruction to a tool that is not there, and it must hand
the question up in a form the parent can relay verbatim. That is D1–D5. A hook that denies writes to
the pending file was considered and dropped: the worker has nothing to bypass, a Bash write evades
any Write/Edit hook, and the file's `by` field makes a worker-authored answer visible after the fact.

The env marker over a flag: the dispatch prompt is deterministic text, but a human running a manual
fork would forget the flag, and the marker is exactly the harness's own statement that a parent
exists. Its one cost — the marker leaks into the suite when the gate runs inside a lane — is paid
once in `tests/helpers.js` (D9) rather than in every driver test.

Dispositions were the hard site: today the *session* edits the disposer return before marking.
Moving the override into the mark (D3) keeps the driver as the one writer of `final` and reuses the
refusal that already guards overrides. MERGE needs no new mechanism at all: the driver already parks
after `--mark closed`; the delegated form only withholds the mark line and the `inspect` run, so the
parent's bare run from the main root sees today's step.

Fragile: the closed `kind` set is the contract spec 03's standing answers match on — adding a kind
later means touching both. Watch during build: the three `then` lines in D3 must stay byte-equal to
the in-session text they mirror (a test pins each pair).

## Canonical Delta

`docs/canonical/pipeline.md` gains, under its stops paragraph: "In a child session (the harness
sets `CLAUDE_CODE_CHILD_SESSION`; sub-agents have no AskUserQuestion) every judgment stop in the
build and review drivers, `/spec:run` Step 0 and `/spec:fix` writes `.claude/pending-question.json`
at the lane's repo root and prints `PENDING_QUESTION`; the parent session relays it and records the
answer (`by: user` or `by: standing`); a bare re-run resumes from the answered file, stops on a
dismissal, and waits otherwise. A delegated review ends at `MERGE_READY`; the parent merges from the
main root." `docs/canonical/review.md`'s MERGE bullet gains "delegated: `MERGE_READY`, no inspect, no
mark line".
