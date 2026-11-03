---
date: 2026-11-03
status: hardened
tier: critical
area: build-stage
breaking: false
depends_on: []
brief: n/a
spiked: 2026-11-03
open_markers: 0
---

# Workers never run git — the ban becomes a hook

## Goal

core § Worker Git Ban says implementation workers never run git, and today the only thing
enforcing it is the worker reading that sentence. This spec makes the ban a deterministic
PreToolUse hook on `Bash`: while the build driver has a worker-dispatching step open in a
working tree, any git invocation in that tree whose verb is not read-only is refused with a
remedy. The signal is a plugin-owned marker the driver keeps in sync with its own derived state
(never an environment variable, never agent identity). Done means: a planted marker plus
`git commit` is blocked in a test, the marker appears and disappears with the driver's states
in a test, and § Worker Git Ban points at the script as its enforcer.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | A new PreToolUse hook `spec/scripts/block-worker-git.sh`, matcher `Bash`, reads the hook JSON on stdin and exits 2 with a `BLOCKED:` stderr when (a) the private git dir of the payload's `cwd` tree carries the `spec-wave-open` marker and (b) the command contains a git invocation whose verb is outside the read-only allowlist (D3); every other case exits 0 — no marker, cwd outside any repo, no git invocation, `jq` absent (AC-20261103-01-1, AC-20261103-01-2, AC-20261103-01-3, AC-20261103-01-4) `[guards: Hook surfaces (process boundary)]` | Same shape as `block-cross-worktree-writes.sh`: topology-based, fail-open outside its one condition, so it is inert for every ordinary session in every host and bites only inside an open build wave. |
| D2 | The signal is the file `spec-wave-open` in the tree's PRIVATE git dir (`git rev-parse --git-dir`, absolutized), content `{"spec":"<repo-relative spec path>","state":"<state>"}`. `spec-build-driver.js` syncs it on every step-print and every `--mark` invocation — written when the derived state is `TESTS`, `RED_FINDINGS`, `RED_ATTRIBUTION`, `WAVE:<label>` or `REPAIR`; removed when it exists at any other state (`INTEGRATION`, `COMMIT`, `REPLAY`, `ESCALATE`, terminal). `--state` stays pure and never touches it. The driver header's "what it does NOT do" gains one line: the marker is a file write into the private git dir, not a git operation (AC-20261103-01-5, AC-20261103-01-6, AC-20261103-01-7) | Mirrors core § Delegated Stops: a worker-dispatching step is a plugin-owned fact. Rejected: the hook payload's `agent_type` field — a fan-out lane is also a sub-agent and legitimately commits, the field's presence depends on the harness version (a guard that silently never fires is the authored ≠ activated failure), and the ban's reason (sibling workers' uncommitted edits) binds anyone in the tree mid-wave. Rejected: any environment variable (core § Delegated Stops). |
| D3 | Verb policy is an allowlist of read-only verbs — `status diff log show rev-parse ls-files ls-tree blame grep describe cat-file name-rev shortlog rev-list merge-base show-ref diff-tree version help`; every other verb is refused, which covers the doctrine's seven (`checkout stash restore reset clean add commit`) and `switch merge rebase push worktree branch` without listing them. Git global options before the verb (`-C <path>`, `-c <k=v>`, `--<flag>[=value]`) are skipped by the extraction grammar in Contracts (AC-20261103-01-2, AC-20261103-01-3) `[guards: Hook surfaces (process boundary)]` | core says "never run git"; the seven are examples, not the rule. A denylist of the seven lets `git switch` (checkout's 2019 split), `merge` and `rebase` through. Reads stay allowed because a worker's scoped self-verification legitimately runs `git diff`/`git status`. |
| D4 | The block message is `BLOCKED: git <verb> during <state> of <spec> — implementation workers never run git (core § Worker Git Ban); the orchestrator commits at the checkpoint step after this step closes.` followed by `  agent: <agent_type or "session">` and `  stale marker (no build running)? the driver clears it on its next step-print: node <driver path> <spec>` (AC-20261103-01-1) | Host Worker Rules: every error names its remedy. The spec path and state come from the marker, so a stale marker is diagnosable from the message alone. |
| D5 | core.md § Worker Git Ban is rewritten to: "Implementation workers never run git. Reads (`status`/`diff`/`log` and the other read-only verbs) pass; every writing verb — `checkout`/`switch`/`stash`/`restore`/`reset`/`clean`/`add`/`commit` and the rest — is refused while a worker-dispatching build step is open. Enforced by `block-worker-git.sh` — its header comment is the contract. The orchestrator owns all git and checkpoint-commits after each green phase." (AC-20261103-01-8) | core § Doctrine Authoring: the rule keeps one binding home and now points at its script like the other enforced sections; the prose in grounding-contract.md and stage-build.md is untouched (both are pointers or the worker's own contract text). |
| D6 | `spec/hooks/hooks.json` gains one PreToolUse entry, matcher `Bash`, command `"${CLAUDE_PLUGIN_ROOT}"/scripts/block-worker-git.sh`, `statusMessage` "Checking worker git ban"; `tests/consistency/red-fixture-coverage.test.js`'s `HOOK_HANDLERS` gains the matching handler (planted marker + `git commit` → 2 with `BLOCKED:`; control `git status` → 0) because that meta-test fails closed on any wired script without a handler (AC-20261103-01-9) | The hook is wired the same way as the four existing ones; the fixture handler is the Falsifiability leg — the guard is tripped on purpose in the suite. |
| D7 | `.claude/rules/spec-pipeline.md` § Risk Tiers hook-surfaces list gains `spec/scripts/block-worker-git.sh` `[no-ac: this repo's own grounding prose, no testable surface]` | A broken hook blocks every Bash call in every host; the list is what makes a future edit to it critical tier. |
| D8 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` `[no-ac: plugin-bump.js --check in the gate is the oracle]` | Host Planning rules: the description is the changelog surface; no version literal in a spec. |
| D9 | Two regression pins: the cross-worktree write hook still blocks a write into another working tree (AC-20261103-01-10), and `isDelegated` still reads only the `spec-delegated` marker and the fan-out table (AC-20261103-01-11) | hooks.json is shared by every hook, and the new marker sits beside the lane marker in the same private git dir — both neighbours must demonstrably not move. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/block-worker-git.sh | CREATE | scripts | PreToolUse `Bash` guard (D1, D3, D4); header comment is the contract: usage, owner `specs/20261103/01-workers-never-run-git.md`, what it does NOT do, `Exit codes: 0 allow · 2 block` |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | `syncWaveMarker(state)` called after state derivation on step-print and mark paths, never on `--state` (D2); header "what it does NOT do" line |
| spec/hooks/hooks.json | MODIFY | doctrine | PreToolUse entry, matcher `Bash` (D6) |
| spec/doctrine/core.md | MODIFY | doctrine | § Worker Git Ban rewritten per D5 |
| .claude/rules/spec-pipeline.md | MODIFY | other | § Risk Tiers hook surfaces list gains the new script (D7) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D8); no dependency change |
| tests/worker-git-hook.test.js | CREATE | tests | AC-20261103-01-1, AC-20261103-01-2, AC-20261103-01-3, AC-20261103-01-4, AC-20261103-01-8, AC-20261103-01-9 |
| tests/build/build-driver-wave-marker.test.js | CREATE | tests | AC-20261103-01-5, AC-20261103-01-6, AC-20261103-01-7 |
| tests/consistency/red-fixture-coverage.test.js | MODIFY | tests | `HOOK_HANDLERS['block-worker-git.sh']` — fixture mirror of AC-20261103-01-1 / AC-20261103-01-3 (D6) |
| spec/entrypoints.json | MODIFY | other | row `spec/scripts/block-worker-git.sh` → `entryPoints: ["spec/hooks/hooks.json"]`, same shape as the cross-worktree hook's row (D6) |
| tests/worktree-hook.test.js | MODIFY | tests | AC-20261103-01-10 — append the ID to the title of the `AC-20260820-02-2:` case; assertions unchanged (D9) |
| tests/delegated/pending-question.test.js | MODIFY | tests | AC-20261103-01-11 — append the ID to the title of the `isDelegated` case and plant `spec-wave-open` beside the probe's tree as the "whatever else" input; assertions unchanged (D9) |

## Contracts

**Hook stdin (PreToolUse, tool `Bash`)** — fields read; everything else ignored:

```json
{ "cwd": "/abs/working/dir",
  "tool_name": "Bash",
  "tool_input": { "command": "<the shell string>" },
  "agent_type": "<agent name — present only inside a sub-agent>" }
```

Documented in the Claude Code hooks reference (lookup embedded at plan time per core § MCP
Policy): common input carries `session_id`, `transcript_path`, `cwd`, `permission_mode`,
`hook_event_name`; `agent_id` / `agent_type` are present when the hook fires inside a
sub-agent; `tool_input.command` is the Bash command string; exit 2 with stderr denies and the
stderr text is shown as the denial reason. `agent_type` is read for the message only (D4),
never for the decision (D2).

**Marker** — path `<private git dir>/spec-wave-open`, where the private git dir is
`git -C <cwd> rev-parse --git-dir`, absolutized against `<cwd>` when relative (observed:
`.git` in a main checkout, `/…/.git/worktrees/<name>` in a linked tree). Content:

```json
{"spec":"specs/20261103/01-workers-never-run-git.md","state":"WAVE:scripts"}
```

**Driver sync** (`spec-build-driver.js`): after `const state = forcedState || deriveState()`
and before the step body is printed, `syncWaveMarker(state)`: `DISPATCHING = state === 'TESTS'
|| state === 'RED_FINDINGS' || state === 'RED_ATTRIBUTION' || state.startsWith('WAVE:') ||
state === 'REPAIR'` → write the JSON above (overwriting); else remove the file when present.
Not called on `--state`. A failed write or remove dies with exit 2 naming the path (never a
silent inert guard).

**Extraction grammar** (bash, `grep -oE` then last word; executed this session on 16 sample
commands):

```
(^|[;&|(`]|[[:space:]])git([[:space:]]+(-C[[:space:]]+[^[:space:]]+|-c[[:space:]]+[^[:space:]]+|--[a-z-]+(=[^[:space:]]+)?))*[[:space:]]+[a-z][a-z-]*
ALLOW='status|diff|log|show|rev-parse|ls-files|ls-tree|blame|grep|describe|cat-file|name-rev|shortlog|rev-list|merge-base|show-ref|diff-tree|version|help'
```

The first extracted verb outside `ALLOW` blocks. A `git` inside quotes (`echo "git commit"`),
`gitk`, `digit add` do not match — observed.

**hooks.json entry**:

```json
{ "matcher": "Bash",
  "hooks": [ { "type": "command",
               "command": "\"${CLAUDE_PLUGIN_ROOT}\"/scripts/block-worker-git.sh",
               "statusMessage": "Checking worker git ban" } ] }
```

**Exit codes** (`block-worker-git.sh`): `0` allow (including every fail-open branch) · `2`
block, stderr per D4.

## Behavior

1. The driver prints `## Step: wave scripts …`; on that same invocation it has written the
   marker. The orchestrator spawns workers with cwd = the build's working tree.
2. A worker runs `node --test tests/foo.test.js && git add -A`. The hook resolves cwd's private
   git dir, finds the marker, extracts verbs `add`, finds it outside `ALLOW`, prints the D4
   message, exits 2. The worker sees the reason and returns receipts without git.
3. A worker runs `git diff --stat`. Verb `diff` is allowed → exit 0.
4. The orchestrator marks `wave-done`; the driver derives `INTEGRATION`, removes the marker,
   prints the integration step. Its later `git add -N` and the checkpoint commit run with no
   marker present.
5. A session is `/clear`ed mid-wave: the marker is still there; the next driver invocation
   re-derives `WAVE:<label>` and rewrites it — consistent by construction. A marker left behind
   by a deleted sidecar is removed by the first driver invocation that derives a
   non-dispatching state; until then the D4 message names the driver command that clears it.
6. A fan-out lane: the lane's own driver writes the marker into the lane tree's private git dir
   (`.git/worktrees/<lane>/spec-wave-open`); the parent on main never sees it (observed).
7. Any session with no build in progress: no marker, every git command passes untouched.

## Acceptance Criteria

- **AC-20261103-01-1**: WHEN the marker exists in cwd's private git dir and the Bash command is a
  single writing verb THE SYSTEM SHALL exit 2 with stderr beginning `BLOCKED: git commit during
  WAVE:scripts of specs/20261103/01-workers-never-run-git.md` (e.g. marker
  `{"spec":"specs/20261103/01-workers-never-run-git.md","state":"WAVE:scripts"}` +
  `git commit -m x` → exit 2, stderr matches `/^BLOCKED: git commit during WAVE:scripts of specs\/20261103\/01-workers-never-run-git\.md/` and contains `agent: `) → writes tests/worker-git-hook.test.js
- **AC-20261103-01-2**: WHEN the marker exists and a writing verb appears behind other text,
  global options, or an alias of checkout THE SYSTEM SHALL exit 2 naming that verb (e.g.
  `npm test && git add -A` → exit 2 naming `add`; `git -C /x reset --hard` → exit 2 naming
  `reset`; `git switch main` → exit 2 naming `switch`; a two-line command `npm run lint\ngit add -A`
  → exit 2 naming `add`) → writes tests/worker-git-hook.test.js
- **AC-20261103-01-3**: WHEN the marker exists and every git verb in the command is in the
  read-only allowlist THE SYSTEM SHALL exit 0 with empty stderr (e.g. `git status`,
  `git --no-pager diff --stat`, `git log --oneline | head`, `git rev-parse --show-toplevel`,
  `git -c core.pager=cat log` → exit 0 each) → writes tests/worker-git-hook.test.js
- **AC-20261103-01-4**: WHEN no marker exists in cwd's private git dir, or cwd is outside any git
  repo, or the command has no git invocation THE SYSTEM SHALL exit 0 (e.g. no marker +
  `git commit -m x` → 0; marker + `npm test` → 0; marker + `echo "git commit"` → 0; cwd = an
  empty temp dir + `git commit -m x` → 0) → writes tests/worker-git-hook.test.js
- **AC-20261103-01-5**: WHEN the build driver prints a step whose derived state is
  worker-dispatching THE SYSTEM SHALL leave `<private git dir>/spec-wave-open` holding the spec
  path and that state (e.g. the fixture host at its first wave → file content
  `{"spec":"<fixture spec path>","state":"WAVE:doctrine+scripts"}`; the same host at `TESTS`
  → `"state":"TESTS"`) → writes tests/build/build-driver-wave-marker.test.js
- **AC-20261103-01-6**: WHEN `--mark wave-done` is accepted for the last pending wave THE SYSTEM
  SHALL remove the marker on that invocation (e.g. after the mark → `existsSync(marker)` is
  `false` and the printed step is `## Step: host integration`) → writes tests/build/build-driver-wave-marker.test.js
- **AC-20261103-01-7**: WHEN the marker exists but the derived state is not worker-dispatching
  THE SYSTEM SHALL remove it on a step-print invocation, and a `--state` invocation SHALL
  neither write nor remove it (e.g. hand-planted marker at `INTEGRATION` + bare run → absent;
  no marker at `WAVE:doctrine+scripts` + `--state` → still absent; marker at `WAVE:…` +
  `--state` → still present) → writes tests/build/build-driver-wave-marker.test.js
- **AC-20261103-01-8**: WHEN core.md § Worker Git Ban is read THE SYSTEM SHALL name its
  enforcer (e.g. the section text matches ``/Enforced by `block-worker-git\.sh`/`` and still
  contains `checkpoint-commits after each green phase`) → writes tests/worker-git-hook.test.js
- **AC-20261103-01-9**: WHEN `spec/hooks/hooks.json` is parsed THE SYSTEM SHALL hold a PreToolUse
  entry with matcher `Bash` whose command names the script (e.g.
  `hooks.PreToolUse.some(e => e.matcher === 'Bash' && e.hooks.some(h => h.command.includes('scripts/block-worker-git.sh')))`
  → `true`, and the four pre-existing entries are unchanged) → writes tests/worker-git-hook.test.js
- **AC-20261103-01-10**: WHEN a Write targets another working tree of the same repo THE SYSTEM
  SHALL CONTINUE TO block it through `block-cross-worktree-writes.sh` (e.g. cwd = linked
  worktree, target in the main checkout → exit 2) → reuses tests/worktree-hook.test.js :: AC-20260820-02-2:
- **AC-20261103-01-11**: WHEN a tree carries no `spec-delegated` marker and is in no fan-out
  table THE SYSTEM SHALL CONTINUE TO report `isDelegated` false whatever else its private git
  dir holds (e.g. a tree with only `spec-wave-open` planted → `false`) → reuses tests/delegated/pending-question.test.js :: isDelegated

## Assumptions (escalation triggers)

- A1: The PreToolUse payload for `Bash` carries `cwd` and `tool_input.command` (hooks reference,
  embedded in Contracts; `cwd` is already relied on by `block-cross-worktree-writes.sh` in live
  runs — specs/20260820/02) — **if false:** the hook fail-opens and the suite cannot see it;
  STOP, ask the user.
- A2: Build workers run with cwd = the build's working tree (`block-cross-worktree-writes.sh`
  header, observed) — **if false:** a worker whose cwd is another tree finds no marker and is
  allowed; record the gap in Gotchas, do not widen the hook.
- A3: `git rev-parse --git-dir` prints `.git` in a main checkout and an absolute
  `.git/worktrees/<name>` path in a linked tree — **executed this session**: main → `.git`,
  linked → `/…/scratchpad/s2b-4036852/r/.git/worktrees/w1`; a marker touched there is not
  visible from the main checkout — **if false:** the absolutize step already handles both.
- A4: The extraction grammar classifies the 16 sample commands as in Contracts — **executed this
  session** (block: `commit`, `add`, `reset`, `stash`, `switch`, `checkout`, multi-line `add`;
  allow: `status`, `diff`, `log`, `rev-parse`, `-c … log`, `npm test`, quoted `git commit`,
  `gitk`, `digit add`) — **if false:** the AC-2/AC-3 tests say which case, fix the grammar.
- A5: The orchestrator makes no git write between a step-print and its mark (driver header:
  its one git write is `git add -N` before the gate child, after INTEGRATION) — **if false:**
  the orchestrator hits the same block; the D4 message tells it to close the step first.
- A6: hooks.json edits take effect at the next session start; the suite exercises the script
  directly — **if false:** nothing in this spec changes.
- A7: `jq` is present wherever the existing bash hooks already depend on it — **if false:** the
  hook fail-opens exactly as `block-cross-worktree-writes.sh` does; `spec-state-gate.sh`
  already announces the absence once per prompt.

## Rationale

The ban existed as a sentence in three places and a worker's contract bullet. Current Claude
Code guidance puts zero-exception rules in hooks or deny rules and treats prose as context a
model may judge inapplicable; core § Rule Enforcement and § Incident Policy say the same in
stricter words. The question was never whether to mechanize it but what signal tells the hook
"a worker is running". Agent identity is documented in the payload now, but it answers the
wrong question: a fan-out lane is a sub-agent that must commit, and the reviewer, disposer and
research seats are sub-agents that never mutate git anyway. The build driver already knows,
from its own derived state, when it has told the session to spawn workers — that is the fact
to publish, and the private git dir is where the plugin already publishes such facts (the lane
marker). Syncing on every invocation rather than at two edges makes the marker self-healing
after `/clear`, a crash, or a deleted sidecar, which is the same property the driver has for
every other piece of state.

Blocking the orchestrator too, while a step is open, was accepted deliberately: the driver's
own contract leaves it no git write in that window, and the reason for the ban (a repo-wide
git op destroys sibling workers' uncommitted edits) does not care who runs the command.

Allowlisting read-only verbs rather than denylisting the doctrine's seven is the one place this
spec widens the rule's letter to match its sentence ("never run git"). `git stash list` and
`git worktree list` are reads that the allowlist refuses; a worker has no need of either, and
the cost of a wrongly refused read is one clear message, while the cost of a wrongly allowed
write is the failure the rule exists for.

Collision closure (lock, advisory): the literals leg lists `Worker Git Ban` in `spec-paths`,
`read-load.test.js`, `fix.md`, `stage-build.md` and a roadmap brief — waived, the `## ` heading
is kept byte-for-byte and only the section body changes. It lists
`checkout/stash/restore/reset/clean/add/commit` in `grounding-contract.md` and the three
generated host agents — waived, those are the worker's own contract text, untouched by design
(no contract edit, no re-stamp); core.md's copy is rewritten per D5. No test pins either
literal. The paths leg's `executes` hits on `spec-build-driver.js` are driver tests that never
inspect the private git dir, so the marker write is invisible to them; the one exhaustive
hook-set pin (`HOOK_HANDLERS`) is already a File Plan row.

Known gap, left open on purpose: a worker that `cd`s into another working tree and commits
there is not caught (the payload's `cwd` is the session's). That is the cross-worktree hook's
territory and it has no Bash arm today; this spec does not add one.

## Canonical Delta

None — this repo keeps no `docs/canonical/` area for the build stage.
