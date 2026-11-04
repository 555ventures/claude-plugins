# spec v8 — architecture (contract between builder agents)

Read `design.md` first. This file fixes module boundaries, file formats and shared APIs so
that parallel builders produce one coherent plugin. If something here is wrong, fix it here
first, then build.

## 0. Rules for every builder

- Node ≥ 22, CommonJS, built-ins only. No npm dependencies.
- Every script: `node spec/scripts/<name>.js <subcommand|flags>`; exit 0 ok, 1 error,
  2 refusal (stderr names the remedy). `--root <dir>` on every driver; `--json` where output
  is consumed by code.
- One module owns each on-disk file (see §2). Nobody else parses it.
- Size caps: driver ≤ 400 LOC, lib file ≤ 250 LOC, command md ≤ 60 lines, agent md ≤ 40
  lines. If you are over, cut features, not line breaks.
- Tests: `tests/<name>.test.js` with `node:test`, behavioural only (run the script on a tmp
  tree, assert exit code / files / JSON). Never assert on prose wording. Use
  `tests/helpers.js` (`tmpdir`, `gitRepo`, `runNode`, `runBash`, `freePort`).
- Don't add flags, modes, policies or fallbacks that no listed step needs.
- Prose shipped to hosts (commands, doctrine, agents, templates) is written in plain English
  for a model that already knows how to code. State intent and the hard rules; do not
  enumerate behaviour.

## 1. Layout

```
spec/
  .claude-plugin/plugin.json      name, version 8.0.0, description (one sentence)
  commands/*.md                   one per command, ≤ 60 lines
  doctrine.md                     the one page every command loads
  agents/builder.md               sonnet, effort high
  agents/reviewer.md              opus, effort low (fable when architecture: true)
  templates/spec.md, roadmap-brief.md, roadmap-overview.md, adr.md, proto-overlay.js
  hooks/hooks.json
  scripts/
    lib/state.js  lib/driver.js  lib/host.js  lib/git.js  lib/report.js  lib/pending.js
    run.js fanout.js queue.js status.js plan.js init.js doctor.js migrate.js
    genesis.js mocks.js prototype.js connect.js release.js red-check.js
    state-gate.sh block-worker-git.sh block-cross-worktree-writes.sh merge-back.sh
tests/helpers.js, tests/*.test.js
```

## 2. Files on disk and their single owner (`lib/state.js`)

All paths relative to host root unless noted. `state.js` exports one `read*`/`write*` pair
per file; writes are atomic (tmp + rename).

| File | API | Notes |
|---|---|---|
| `.claude/spec.config.json` | `readConfig(root)` | Keys in §3. Missing file → `{}` with defaults applied. |
| `specs/YYYYMMDD/NN-slug.md` | `readSpec(path)` → `{frontmatter, body, sections, intent, filePlan, acs}`; `writeStatus(path, status)` | Frontmatter parse is the only markdown parse in the plugin. |
| `<spec>.run/state.json` | `readRun(spec)`, `writeRun(spec, state)`, `clearRun(spec)` | One sidecar per in-flight spec. Gitignored. Shape in §4. |
| `<git-common-dir>/spec-queue.json` | `readQueue(root)`, `writeQueue(root, q)` | `{version: 2, seq, items[]}`; item `{id, kind: spec|brief|prompt, payload, added, done?}`. |
| `<git-common-dir>/spec-fanout.json` | `readFanout`, `writeFanout` | `{step, batch: [{spec, worktree, branch, status, question?}], started}` |
| `.claude/pending-question.json` | in `lib/pending.js` | Lane question relay (copy-trim of v7). |
| `design/prototypes/<stem>/{status,pins,contract}.json` | `readProto`, `writeProto` | Owner: prototype.js via state.js. |
| `design/mocks/{status.json,seed.md}` | `readMocks`, `writeMocks` | |
| `.claude/genesis/status.json` | `readGenesis`, `writeGenesis` | |

`spec.config.json` keeps the v7 path so migration is a key trim, not a move.

## 3. Config keys (all optional except `testCommand`)

```json
{
  "testCommand": "npm test",              // whole suite; the gate
  "testFileCommand": "npx vitest {file}", // optional: single-file run used by red-check
  "setupCommand": "npm ci",               // run once in a fresh worktree
  "trunk": "main",
  "lanes": 3,                             // fanout parallelism
  "seats": { "builder": {"model":"sonnet","effort":"high"},
             "reviewer": {"model":"opus","effort":"low"},
             "orchestrator": {"model":"opus","effort":"medium"} },
  "worktreePerSpec": true,
  "mergeStrategy": "merge-commit",        // or ff-only | squash
  "walkthrough": { "baseUrl": "", "project": "", "tokenEnv": "WALKTHROUGH_TOKEN" },
  "prototype": { "url": "http://localhost:3000", "bootCommand": "npm run dev", "overlay": "src/main.tsx" },
  "release": { "deployCommand": "", "stagingUrl": "", "e2eCommand": "", "promoteCommand": "" }
}
```

## 4. Run state (`<spec>.run/state.json`) and the run driver

```json
{ "step": "BUILD", "spec": "specs/20261104/01-x.md", "worktree": ".claude/worktrees/spec-01-x",
  "branch": "spec/01-x", "base": "<sha>", "attempts": {"build": 1, "fix": 0},
  "gate": {"status": "red", "runId": "...", "output_tail": "..."},
  "review": {"findings": [], "verdict": "clean|fix|escalate"}, "history": [...] }
```

`run.js` steps, in order. The session does only the printed step, replies with the printed
`--mark`, re-runs the driver. Each accepted mark prints
`✅ checkpoint — <prev> → <next>; safe to /clear and re-run /spec:run <spec>`.

| Step | Driver does | Session does | `--mark` |
|---|---|---|---|
| OPEN | creates worktree+branch from trunk (or in place with `--in-place`), runs setupCommand, writes state | nothing | (auto) |
| BUILD | prints the builder brief: spec path, Intent block, File Plan, test command, "write failing tests first, then code, run `testCommand` until green" | dispatches ONE `builder` agent (seat from config; Opus on attempt 2) in the worktree | `built` |
| GATE | runs `testCommand` in the worktree itself; green-run cache by tree hash (`lib/host.js`) | nothing | (auto) → REVIEW or REPAIR |
| REPAIR | prints failure tail; cap 2, then ESCALATE | dispatches builder with the failure | `repaired` → GATE |
| REVIEW | prints reviewer brief: diff vs base, spec Intent + ACs; seat = reviewer, or Fable when `architecture: true` | dispatches ONE `reviewer` agent; writes findings JSON | `reviewed --file <json>` |
| FIX | only for `blocking` findings; cap 1, then ESCALATE | dispatches builder with findings | `fixed` → GATE |
| ESCALATE | prints the options: retry on opus / park (queue a fix) / amend spec | asks the user (one question) | `escalate <retry\|park\|amend>` |
| COMMIT | driver commits in the worktree (`lib/git.js`), message from the spec title | nothing | (auto) |
| MERGE | merge-back to trunk per `mergeStrategy`, re-run gate on trunk tree (cache hit when unchanged) | conflicts only: asked | (auto) / `conflicts-resolved` |
| DONE | `status: done`, sidecar cleared, worktree removed, prints the report | nothing | — |

A lane (sub-agent run under fanout) never asks: at ESCALATE or any question it writes
`pending-question.json`, prints `PENDING_QUESTION`, exits 0.

Builder agent brief must include the Intent block verbatim and the line
"Do not touch files outside the File Plan without listing them in your final summary."

## 5. Fanout (`fanout.js`)

PLAN → DISPATCH → WAIT → RELAY → MERGE → REPORT, then back to PLAN until the queue is
empty. PLAN picks up to `lanes` queue items whose specs are `hardened` and whose File Plans
do not overlap (path set intersection); overlapping ones wait. DISPATCH prints one Agent
call per lane: subagent `claude`, model = orchestrator seat, prompt = `/spec:run <spec>`
inside `.claude/worktrees/spec-<stem>`. WAIT: lanes return; the driver reads each lane's
run state. RELAY: all `pending-question.json` batched into one message; `answered --lane`.
MERGE: lanes in queue order, gate after each, stop on red (`MERGE_RED` → `gate-repaired`).
REPORT: one report, queue items ticked `done`.

## 6. Plan (`plan.js` + `templates/spec.md`)

`/spec:plan` is driven by the session (Fable). The script only: numbers the spec
(`specs/YYYYMMDD/NN-slug.md`), validates the template sections exist, counts
`[NEEDS CLARIFICATION:` markers, and locks (`status: hardened`) when zero. The template
adds one block at the top of the body:

```
## Intent
- You asked: <one sentence in the user's words>
- I will build: <3–6 bullets>
- I will not touch: <bullets>
- Architecture or behaviour change: no | yes — <what>, needs your yes
```

Frontmatter stays v7-compatible: `date, status (draft|hardened|implementing|done),
area, depends_on, brief, architecture: true|false`. Sections kept: Intent, Goal, Decisions,
File Plan, Acceptance Criteria (`AC-YYYYMMDD-NN-k`, WHEN/SHALL), Assumptions. Dropped:
tier, Users, Contracts, UI, Data Model, Rationale, Canonical Delta, oracle/pre-green tags.

## 7. Hooks (`hooks/hooks.json`)

| Event | Script | Rule |
|---|---|---|
| UserPromptSubmit | `state-gate.sh` | `/spec:run <spec>` on a `draft` spec or one with `[NEEDS CLARIFICATION:` markers → exit 2 with the remedy. |
| PreToolUse Bash | `block-worker-git.sh` | inside a lane worktree, builder/reviewer agents may not run `git commit/push/merge/rebase/reset/checkout`. Marker: `<git-dir>/spec-lane-open`. |
| PreToolUse Write\|Edit | `block-cross-worktree-writes.sh` | copy-trim from v7. |

## 8. Report (`lib/report.js`)

`render({outcome: '✅ …', bullets, pins, warns, blocks, artifacts, queued, next})` prints
the v7 fixed order. `next` is a command or `nothing needs you — <reason>`. ≤ 60 LOC.

## 9. Other drivers

- `queue.js`: `next|list|add|move|done|show`. ≤ 150 LOC. Duplicate payload refused.
- `status.js`: roadmap (✅/⬜ per brief by spec status), 🎯 Next (queue head + runnable
  lanes), ⚠️ pending questions, verdict line. ≤ 200 LOC. `--json`.
- `init.js`: detect test command (package.json scripts.test, pytest, go test, cargo test),
  trunk, write config; ask only what cannot be detected (one AskUserQuestion). ≤ 150 LOC.
- `doctor.js`: config valid, testCommand runs (exit 0 or 1, never "command not found"),
  worktrees gitignored, pending sidecars listed. ≤ 100 LOC.
- `red-check.js`: new test files vs base must fail on base and pass on HEAD; vacuous green
  reported. ≤ 80 LOC. Called by GATE when `testFileCommand` exists.
- `genesis.js`: DISCOVERY → MENUS → DECIDE → SCAFFOLD → ROADMAP → HANDOFF → GROUNDED.
  Research menus = parallel Sonnet web agents (one per open dimension). DECIDE writes
  `.claude/genesis/stack-descriptor.json` + ADRs. ROADMAP writes briefs + queue entries.
  HANDOFF runs init. ≤ 400 LOC.
- `mocks.js`: SEED → SCREENS → APPROVED, walkthrough service or terminal mode. ≤ 250 LOC.
- `prototype.js`: OPEN → ROUND → APPROVED → CONTRACTED → CLOSED, plus `serve`. Pins via
  `templates/proto-overlay.js` POSTing to the serve endpoint. CONTRACTED writes
  `contract.json` (every pin as a sentence) and queues `/spec:plan <contract>`. ≤ 400 LOC.
- `connect.js`: copy-trim of v7 walkthrough-connect + client. ≤ 350 LOC total.
- `release.js`: deploy → e2e → promote (asked) → report. ≤ 120 LOC.
- `migrate.js`: v7 host → v8, see `host-footprint.md`. Idempotent, prints a plan first,
  `--apply` writes. Archives v7-only files under `docs/archive/v7/`.
- `enforce`: command md only; says init now writes lint/typecheck into `testCommand`.

## 10. Doctrine (`spec/doctrine.md`, ≤ 1 page)

Headings: What this plugin does · Files it reads · Lifecycle · Seats · How to drive a driver
· When to ask (irreversible, architecture: yes, lane questions) · Glossary (lane, mark, pin,
seat, checkpoint). Maintainer rules live in this repo's CLAUDE.md, not in the plugin.
