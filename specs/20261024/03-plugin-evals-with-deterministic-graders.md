---
date: 2026-10-24
status: done
build_base: main
tier: standard
area: evals
breaking: false
depends_on: []
brief: n/a
open_markers: 0
spiked: 2026-10-24
diff_base: 0a44191f4e57fed0f75d2b29ba6ccfa174ec18ca
---

# Plugin evals with deterministic graders

## Goal

Nothing today proves that a Claude session picks up this plugin and follows its drivers'
printed steps; the 1,278 tests prove the scripts alone. Anthropic's `claude plugin eval`
(Claude Code 2.1.269+) runs a case against the plugin and against a no-plugin baseline and
reports the delta. This spec ships a small suite under `spec/evals/`: three cheap cases
(status, queue, doctor) with deterministic graders that gate nothing automatically but run
in one command, plus one heavy `/spec:run` case tagged for on-demand runs. Done means the
suite runs end to end on this machine and a test pins its shape.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Every grader is deterministic: `type` ∈ {`regex`, `tool_used`, `tool_order`, `file_exists`}; no `llm` or `baseline` grader anywhere under `spec/evals/` (AC-20261024-03-1) | Deterministic graders cost nothing beyond the run and cannot drift with a judge model; the user chose cheap cases. [asked: cheap cases now, heavy one on demand] |
| D2 | Three cheap cases, tag `cheap`, `runs: 3`, `max_turns: 15`: `status` (prompt in plain words asks where the work stands; graders: `tool_used Skill` with `input_match` on `spec:status` marked `arm: with-only`, `tool_used Bash` with `input_match` on `spec-status`), `queue` (asks what is queued next; `spec:queue` / `spec-queue`), `doctor` (asks to check the repo's spec grounding for drift; `spec:doctor` / `contract-hash`, per D8) (AC-20261024-03-2, AC-20261024-03-3) | Each proves the plugin is chosen on natural phrasing and its script actually runs; the `with-only` arm makes the Skill grader an indicator, not score, under `--ablation with-without`. |
| D3 | One heavy case `run`, tags `[heavy]`, `runs: 1`, `max_turns: 150`, `timeout_seconds: 1800`; its `fixture.sh` scaffolds a git repo with a minimal grounded host and one hardened spec; graders: `tool_order` Bash `spec-build-driver` before Bash `spec-review-driver`, `tool_used` Bash with `input_match` on `--mark closed` (AC-20261024-03-4) | The only case that proves a session follows the drivers' printed steps; priced per run in the README and never in the cheap tag. |
| D4 | Every case has a `fixture.sh` named in `context.scaffold_script` of the case's `case.yaml` (D9) that writes `.claude/spec.config.json`, the pipeline rules file and (cheap cases) one done spec plus a ledger row; the suite is invoked as `claude plugin eval ./spec --scaffold --tag cheap --no-publish` (AC-20261024-03-5) | Eval runs load no project config; the host grounding must come from the fixture. |
| D5 | The suite is never part of `gateCommand` or `testCommand`; `spec/evals/README.md` carries the two invocations (cheap, heavy), the measured cost per run, and the reading of `aggregates` (AC-20261024-03-6) | Each run is a paid Claude session; the gate stays free and deterministic. |
| D6 | `tests/evals-suite.test.js` pins the layout: each case dir has `prompt.md` with frontmatter keys ⊆ {`name`,`description`,`tags`,`runs`,`max_turns`,`timeout_seconds`,`allowed_tools`,`expected_outcome`} (D9 moves `context` to `case.yaml`), at least one `graders/*.md` with a D1 type, `tags` containing exactly one of `cheap`/`heavy`, and `claude plugin validate ./spec` exits 0 (AC-20261024-03-1, AC-20261024-03-7) | The CLI rejects unknown keys at run time only; the test catches it in the gate. |
| D7 | The reviewer seat stays as `agents/reviewer.md` declares it (Fable, effort low) on every review [asked: keep it on every review]; no step text changes for the Opus 5 prompting page [no-ac: grep of step text for verify-again scaffolding found zero live hits on 2026-10-24]; no Stop/SessionEnd hook is added [asked: drop this item] | Recorded here so the alignment audit's three open questions have one answer each. |
| D8 | The `doctor` case's Bash grader matches `contract-hash` (doctor's check 2, `spec-paths contract-hash`), not `spec-doctor` — no `spec-doctor` script exists; doctor runs `spec-paths` lookups directly (AC-20261024-03-3) | Build-time ruling: D2 named a stem nothing ships, so that grader could never pass; `contract-hash` is the doctor-only deterministic call. [auto-picked at build, veto anytime] |
| D9 | `context.scaffold_script` lives in a per-case `case.yaml` (`schema_version: "1.1"`, `name`, `context`), never in `prompt.md` frontmatter; Bash-using runs are invoked with `--allow-tools Bash` (the heavy case also `Edit Write`) and `--trust-plugin` (AC-20261024-03-2, AC-20261024-03-6) | Build-time correction under A1's remedy: the first executed run refused every case with `unknown frontmatter key "context"`, and the CLI grants nothing beyond read-only tools without `--allow-tools`. [auto-picked at build, veto anytime] |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/evals/README.md | CREATE | other | D5: invocations, cost per run, how to read results |
| spec/evals/status/prompt.md | CREATE | other | D2 |
| spec/evals/status/fixture.sh | CREATE | other | D4 |
| spec/evals/status/graders/skill.md | CREATE | other | D2 `tool_used Skill`, `arm: with-only` |
| spec/evals/status/graders/script.md | CREATE | other | D2 `tool_used Bash` |
| spec/evals/queue/prompt.md | CREATE | other | D2 |
| spec/evals/queue/fixture.sh | CREATE | other | D4 |
| spec/evals/queue/graders/skill.md | CREATE | other | D2 |
| spec/evals/queue/graders/script.md | CREATE | other | D2 |
| spec/evals/doctor/prompt.md | CREATE | other | D2 |
| spec/evals/doctor/fixture.sh | CREATE | other | D4 |
| spec/evals/doctor/graders/skill.md | CREATE | other | D2 |
| spec/evals/doctor/graders/script.md | CREATE | other | D2 |
| spec/evals/run/prompt.md | CREATE | other | D3 |
| spec/evals/run/fixture.sh | CREATE | other | D3/D4 |
| spec/evals/run/graders/order.md | CREATE | other | D3 `tool_order` |
| spec/evals/run/graders/closed.md | CREATE | other | D3 `tool_used` |
| spec/evals/status/case.yaml | CREATE | other | D9 |
| spec/evals/queue/case.yaml | CREATE | other | D9 |
| spec/evals/doctor/case.yaml | CREATE | other | D9 |
| spec/evals/run/case.yaml | CREATE | other | D9 |
| spec/evals/host.sh | CREATE | other | D4: the grounded-host writer every fixture.sh sources |
| spec/evals/.gitignore | CREATE | other | D5: ignores `results/`, where every eval run writes its report |
| README.md | MODIFY | doctrine | one row under the plugin's table pointing at spec/evals/README.md |
| spec/.claude-plugin/plugin.json | MODIFY | scripts | `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/evals-suite.test.js | CREATE | tests | AC-20261024-03-1, AC-20261024-03-2, AC-20261024-03-3, AC-20261024-03-4, AC-20261024-03-5, AC-20261024-03-6, AC-20261024-03-7 |

## Contracts

Case layout (verified against `claude plugin eval init --bare` output and one executed run, 2026-10-24, Claude Code 2.1.310):

```markdown
<!-- spec/evals/status/prompt.md -->
---
tags: [cheap]
runs: 3
max_turns: 15
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---
Where does the work stand in this repo? Give me the one next action.
```

```yaml
# spec/evals/status/case.yaml (D9)
schema_version: "1.1"
name: status
context:
  scaffold_script: fixture.sh
```

```markdown
<!-- spec/evals/status/graders/skill.md -->
---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:spec:)?status"'
arm: with-only
---
```

```markdown
<!-- spec/evals/status/graders/script.md -->
---
type: tool_used
tool: Bash
input_match: 'spec-status'
---
```

```markdown
<!-- spec/evals/run/graders/order.md -->
---
type: tool_order
before: { tool: Bash, input_match: 'spec-build-driver' }
after:  { tool: Bash, input_match: 'spec-review-driver' }
---
```

Result JSON (`--json <path>`): top-level `schemaVersion, claudeVersion, startedAt, durationSeconds, costUsd, partial, suite, cases, aggregates`; each case carries `graders[]` and `arms.with[]` (and `arms.without[]` under ablation) with `score, passed, turns, costUsd`.

## Behavior

- `claude plugin eval ./spec --scaffold --tag cheap --no-publish` runs 3 cases × 3 runs × 2 arms
  and prints WITH / W/OUT / Δ per case; the README states the measured cost of one such run.
- `claude plugin eval ./spec --scaffold --tag heavy --no-publish --runs 1` runs the `/spec:run`
  case once, with-plugin arm only meaningful (the baseline arm has no driver to call).
- The gate never invokes the CLI; `tests/evals-suite.test.js` reads files and runs
  `claude plugin validate ./spec` (a local, free command).

## Acceptance Criteria

- **AC-20261024-03-1**: WHEN the test reads every `spec/evals/*/graders/*.md` THE SYSTEM SHALL find each frontmatter `type` in {`regex`,`tool_used`,`tool_order`,`file_exists`} and zero files with `type: llm` or `type: baseline` → writes tests/evals-suite.test.js
- **AC-20261024-03-2**: WHEN the test reads `spec/evals/{status,queue,doctor}/prompt.md` THE SYSTEM SHALL find `tags` containing `cheap`, `runs: 3`, `max_turns` ≤ 15, and the case's `case.yaml` carrying `context.scaffold_script: fixture.sh` with that file present and executable → writes tests/evals-suite.test.js
- **AC-20261024-03-3**: WHEN the test reads each cheap case's graders THE SYSTEM SHALL find one `tool_used` grader on `Skill` carrying `arm: with-only` whose `input_match` names the case's command, and one `tool_used` grader on `Bash` whose `input_match` names the case's script stem (`spec-status`, `spec-queue`, `contract-hash` — D8) → writes tests/evals-suite.test.js
- **AC-20261024-03-4**: WHEN the test reads `spec/evals/run/prompt.md` and graders THE SYSTEM SHALL find `tags` containing `heavy` and not `cheap`, `runs: 1`, a `tool_order` grader with `before` on `spec-build-driver` and `after` on `spec-review-driver`, and a `tool_used` grader whose `input_match` contains `--mark closed` → writes tests/evals-suite.test.js
- **AC-20261024-03-5**: WHEN each `fixture.sh` is executed in an empty temp directory THE SYSTEM SHALL exit 0 and leave `.claude/spec.config.json` parseable with `gateCommand`, `testCommand`, `runtime` and `pipelineRules` keys and the rules file present → writes tests/evals-suite.test.js
- **AC-20261024-03-6**: WHEN `spec/evals/README.md` is read THE SYSTEM SHALL contain both invocation lines (`--tag cheap`, `--tag heavy`) and a line matching `cost per run` with a dollar figure → writes tests/evals-suite.test.js
- **AC-20261024-03-7**: WHEN `claude plugin validate ./spec` runs at the repo root THE SYSTEM SHALL exit 0 (`claude` resolved on PATH) → writes tests/evals-suite.test.js

## Assumptions (escalation triggers)

- A1: `claude plugin eval` accepts the `prompt.md` + `graders/*.md` layout and the `regex`/`tool_used` keys as written — verified 2026-10-24: `claude plugin eval init --bare smoke` produced that layout; one executed case (`regex` grader, `runs: 1`, `--ablation none`) scored 1, cost $0.041, result JSON keys as in Contracts — **if false:** re-read `code.claude.com/docs/en/plugin-evals` and correct the keys in Contracts before building.
- A2: `tool_order` accepts `{ tool, input_match }` objects for `before`/`after` (docs table, 2026-10-24) — not executed — **if false:** replace with two `tool_used` graders and drop the ordering claim.
- A3: the eval workspace has `node` on PATH and the plugin's scripts run from the plugin dir (`spec-paths` resolves via `${CLAUDE_PLUGIN_ROOT}`) — **if false:** the heavy case is tagged `heavy` and the README records the failure; cheap cases still prove skill selection.
- A4: one cheap run of 3 cases × 3 runs × 2 arms costs under $3 — the README records the measured figure from the first run — **if false:** reduce `runs` to 2 in D2 and record the figure.

## Rationale

The 2026-10-24 research pass (post-July-2026 sources only) found the plugin aligned with
Anthropic's shape — a script holds the sequence, hooks are the deterministic layer,
doctrine loads by section — and found one gap it could close cheaply: no evidence that a
model follows the plugin at all. Anthropic's tool for that is `claude plugin eval` with a
no-plugin baseline. The user chose three cheap cases gating nothing automatically, with one
heavy case for the question that matters (does a session walk the drivers' steps?) run only
on request because it is a full pipeline run billed per attempt.

D7 closes the audit's other two alignment questions without code: the user kept the
different-family reviewer on every review (the 10-fix sample with 2 soft / 0 hard findings
is the recorded reopen condition), and the Stop/SessionEnd hook idea was dropped because a
Stop hook fires at every decision stop and would fight the stop-and-resume design, while
SessionEnd cannot block and has a 1.5-second budget. A grep of the drivers' printed step
text for verify-again scaffolding found no live hits, so nothing changes for the Opus 5
prompting page.

Rejected: an `llm` grader for "the reply is useful" — judge drift and cost without a
deterministic claim; the Skill `with-only` indicator already answers "was the plugin used".

### Build departures (2026-10-24, folded from the deviations sidecar)
- D2's doctor stem `spec-doctor` named no shipped script; the grader matches `contract-hash` (D8).
- The first executed run refused every case (`unknown frontmatter key "context"` in `prompt.md`),
  falsifying A1's Contracts block; each case now carries a `case.yaml` (D9), D4/D6/AC-2 amended.
- D4's invocation lacked `--allow-tools Bash`, without which every Bash grader fails; the README
  invocations carry it plus `--trust-plugin` (D9).
- `spec/evals/host.sh` (shared grounded-host writer) and `spec/evals/.gitignore` (the CLI writes
  `results/` inside the plugin) were added with File Plan rows.
- Measured: cheap run $2.89, 8 min, WITH 1.00, W/OUT 0.11, Δ 0.89 — A4 held.

### Advisory debt (review rv_38a127e84689)
- a0 spec/evals/doctor/graders/script.md:4 — The cheap cases' Bash graders match a bare substring of the script stem; a no-plugin baseline run satisfied the doctor contract-hash grader once, so the grader can pass on a command that merely contains the stem. — Anchoring the Bash graders on `spec-paths <key>` would also fail a with-plugin run that calls the resolved script path directly, and any grader change needs a paid re-measure (~$2.89); the 1-in-3 doctor baseline pass is visible in the delta. Reopen if a cheap run shows W/OUT above 0.34 on any case.
- a1 spec/evals/run/graders/order.md:3 — The heavy run case's tool_order grader shape ({ tool, input_match } flow maps) has never been executed against the CLI (spec A2: not executed). — Only a paid heavy run can prove the CLI accepts the tool_order flow-map form (spec A2); A2's own remedy (two tool_used graders) applies if the first heavy run refuses the case.

## Canonical Delta

docs/canonical/scripts.md, new paragraph "Evals": "`spec/evals/` holds the plugin's
`claude plugin eval` suite — three `cheap` cases proving skill selection and script
execution with deterministic graders, one `heavy` `/spec:run` case run on request. The suite
is never in the gate; `tests/evals-suite.test.js` pins its shape."
