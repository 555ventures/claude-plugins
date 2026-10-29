# Audit: question points and model placement under the Claude 5 family (2026-10-29)

Scope: the `spec` and `git` plugins at 7.281.0. Read-only; nothing was changed. Produced by a
Fable 5.1 session orchestrating two Opus catalog agents, one Opus model-research agent, two
Sonnet audit agents and one Claude Code docs agent. Every line anchor was spot-checked by the
orchestrating session before it was kept.

Three questions were asked:

1. How do Fable 5.1, Opus 5.5, Sonnet 5.5 and Haiku 5.5 behave, and what does Anthropic now
   recommend for an agentic pipeline?
2. Where does the plugin stop and ask the human, and which of those stops could the model or a
   script decide instead?
3. Where does the plugin decide silently something the owner would want to be asked about?

---

## Part 1 — The Claude 5 family (verified against live docs)

### 1.1 Per-model facts

| | Fable 5.1 `claude-fable-5-1` | Opus 5.5 `claude-opus-5-5` | Sonnet 5.5 `claude-sonnet-5-5` | Haiku 5.5 `claude-haiku-5-5` |
|---|---|---|---|---|
| Positioning | Demanding reasoning, long-horizon agentic work; use when Opus 5.5 at higher effort still falls short | Long-running agentic coding; the recommended starting point | Best speed/intelligence balance | High-volume classification, extraction, routing, simple subagents |
| Price in/out per MTok | $10 / $50 (cache read $0.25) | $4 / $20 | $2 / $10 | $0.10 / $0.50 (≤100K prompt) |
| Context / max out | 1M / 128K | 1M / 128K | 1M / 128K | 1M / 128K |
| Effort default (API) | high | medium | high (Claude Code: medium) | medium |
| Effort levels | low…max | low…max | low…max | low…max |
| Thinking | adaptive, always on | adaptive, always on | adaptive | adaptive, on by default |
| Best seat | Spec author/hardener, architecture, root cause | Orchestrator, implementer, reviewer, disposer | Worker, research agent | Classifier, router, lookups |

Claude Code aliases: `fable`, `opus`, `sonnet`, `haiku` resolve to the newest of each tier on the
Anthropic API (`fable` → Fable 5.1 unless `ANTHROPIC_DEFAULT_FABLE_MODEL` overrides). Full ids are
accepted in `--model`, `/model`, subagent frontmatter and settings. Bedrock/Vertex/Foundry aliases
lag by a generation. `best` = `fable` where available else `opus`.

Subagent frontmatter accepts `model:` (alias, full id, or `inherit`) and `effort:` (low…max).
Resolution: per-call `model` param → frontmatter → `CLAUDE_CODE_SUBAGENT_MODEL` → main model.
`CLAUDE_CODE_EFFORT_LEVEL` overrides every frontmatter effort.

**Subagents can never call AskUserQuestion** — the tool is stripped even when listed. Only the lead
session can ask. Hooks cannot ask a question either; a PreToolUse hook can only `allow`, `deny`,
`ask` (the normal permission prompt) or `defer` (headless only).

### 1.2 Behavioural deltas that matter for this plugin

- **Emphasis prompting is obsolete.** "Be thorough", "think hard", ALL-CAPS, "keep going until
  done" now over-apply or cause over-work. Effort is the knob. Over-prescriptive step lists lower
  Fable 5.1 output quality — state outcome and constraints.
- **Early stops and unneeded check-ins are the main failure in unattended runs.** Opus 5.5 ends
  turns on progress updates; Sonnet 5.5 at low/medium asks questions it could answer; Fable 5.1
  asks "Shall I…?" for steps already covered. The documented fix is a harness-level completion
  check (Stop hook / `/goal`), a continuation cap of 2–3, and the "check in only when different
  readings lead to materially different work" paragraph in the system prompt.
- **Scope and test sprawl.** Sonnet 5.5 adds tests/docs at every effort; Fable 5.1 commits scratch
  checks as permanent tests; Sonnet 5.5 at xhigh/max launches its own reviewer subagents (a
  published "do not launch reviewer subagents unless asked" line cut cost ~⅓).
- **Low-effort verification gap.** Sonnet 5.5 and Haiku 5.5 at low effort report done without a
  real check. Deterministic gates already cover this for the build; keep them.
- **Reviewers obey severity filters literally.** "Report only hard findings" lowers recall. Ask
  for every finding with severity + confidence and filter afterwards.
- **Delegation.** Opus 5.5 delegates well; Fable 5.1 does best with asynchronous subagents. Cap
  spawn counts; multi-agent runs cost 3–10× tokens.
- **Decorrelation.** Anthropic's documented mechanism for an uncorrelated review is a **fresh
  context that never saw the author's reasoning**, not a different model family. Cross-model
  review as a decorrelation method is third-party folklore (unverified). Opus 5.5 is documented
  as catching more bugs with fewer false alarms than Opus 5.
- **Cost rule.** "Tune one model before you add a second": Opus 5.5 at `medium` beats Opus 5 at
  `high` on repository work at roughly half the tokens; Sonnet 5.5 at `medium` beats Sonnet 5 at
  `high` at under a fifth of the cost. Haiku workers under an Opus lead cut cost 32% but pass
  rate ~4 points — compare against lower effort first.

### 1.3 Recommended Model Placement (replaces core.md § Model Placement)

| Seat | Today | Recommended | Why |
|---|---|---|---|
| Spec author / hardener (`/spec:plan`, genesis design seats) | Fable (prose) | **Fable 5.1 @ high**; fallback Opus 5.5 @ xhigh | Low volume, ambiguity-heavy; the documented Fable tier |
| Build orchestrator | Sonnet | **Opus 5.5 @ medium** | Documented default; orchestrators only pay off with bulk independent work |
| Implementer workers | Sonnet (no effort) | **Sonnet 5.5 @ medium** baseline; Opus 5.5 @ medium for migrations / unfamiliar code | Gates cover the low-effort gap; avoid `low` (check-ins rise) |
| Reviewer | `fable` @ low | **Opus 5.5 @ high**, fresh context, read-only; Fable 5.1 @ medium only when the builder was Opus | Fresh context is the decorrelation; top tier at low effort is upside-down spend |
| Disposer | inherit @ medium | **Opus 5.5 @ medium** (explicit, not inherit) | Judgment-heavy, bounded input; inherit makes it Fable in a Fable session |
| Research / option menus (`wf-research`, `wf-enforce`) | Sonnet @ medium | **Sonnet 5.5 @ medium** + "search even when confident" line | Documented weakness: answers from memory |
| Lookups, re-reads, queue groom, completion checks | Haiku | **Haiku 5.5 @ low/medium** | Documented role |
| Question-style judge hook | `claude-haiku-4-5-20251001` (hard pin) | **`haiku` alias** or `claude-haiku-5-5` | Pinned snapshot will retire and the judge then silently skips |

Doctrine prose to retire: "different model family than the builder" (replace with "fresh-context,
blind-to-author dispatch; a different tier where the builder was the top tier"); the
"Opus session that builds" sentence (contradicts "Sonnet is every worker" and "Fable plans");
the `/model fable` stop-and-switch in genesis (replace with `Agent {model: "fable", effort:
"high"}` dispatch — the opus fallback already exists in core).

Prompt hygiene to apply across commands and agents: delete "be thorough / exhaustive / never
skip" style emphasis; keep the deterministic gates; add to every long-running seat the
"four ways a turn ends / do not stop for a non-blocking decision" paragraph and to every
worker the "run a real check that exercises the change" paragraph; add to the reviewer "report
every finding with severity and confidence; do not pre-filter".

### 1.4 Plugin surfaces that break or drift with Claude 5 ids

| Location | Problem | Fix |
|---|---|---|
| `spec/scripts/question-style-gate.js:53` | `JUDGE_MODEL = 'claude-haiku-4-5-20251001'` | alias `haiku` |
| `spec/agents/reviewer.md:4-5` | `model: fable`, `effort: low` | `opus`, `high` (see 1.3) |
| `spec/agents/disposer.md:6-7` | `model: inherit` | `opus`, `medium` |
| `spec/doctrine/stages/stage-review.md:39-48`, `spec-review-driver.js:2488-2569` | no model override → Fable session gets a Fable reviewer (correlated) | explicit model in the dispatch line |
| `spec/commands/fix.md:48-50` | two-valued switch Fable↔Opus | same explicit rule as review |
| `spec/commands/genesis.md:39-43`, `genesis-driver.js:2882/2910/2945` | up to 3 human `/model fable` switches | subagent dispatch |
| `spec/commands/{genesis,enforce}.md` "Intended model: Opus" | stale tiering | Fable or Opus 5.5 per 1.3 |
| Tests to update in lockstep | `tests/review/reviewer-seat.test.js:23-38`, `tests/consistency/genesis-doctrine.test.js:1194-1208`, `tests/queue/queue-hygiene.test.js:199-202` | |

Nothing parses model ids: `sessionModel()` and `verdict.js --model` pass raw strings through, so
ledger rows with `claude-fable-5-1` etc. are fine.

---

## Part 2 — Every point where the plugin asks the human

Legend: **A** automate (rule or model decides, print `📌 Auto-picked … (veto anytime)`), **K**
keep human, **R** reshape (batch, recommend-first, move in time, or notify-and-proceed).

A greenfield web-app run today costs roughly **25–45 human turns before the first `/spec:plan`**.
Target after the changes below: about 8–12.

### 2.1 Genesis

| ID | Step (anchor) | What is asked | Verdict | Change |
|---|---|---|---|---|
| GEN-01 | entry guard, genesis.md:19 | "real codebase → STOP, run init" | A | reroute into `/spec:init` |
| GEN-02 | design steps, genesis.md:39-43 | `/clear` + `/model fable` ×3 | A | dispatch `Agent {model:"fable"}` |
| GEN-03 | DISCOVERY coverage, doctrine:12-19 | 10 product-coverage keys, open interview | R | pre-fill guesses from the idea, confirm in batches of 4 |
| GEN-04 | archetype, doctrine:27 | silently picked | R | print `📌 Auto-picked archetype` with a one-line why — it is the master variable |
| GEN-06 | brief render, doctrine:24 | shown, unclear if waits | R | one explicit "proceed unless vetoed" checkpoint |
| GEN-08 | BRIEF mocks hand-off, driver:2698 | "run /spec:mocks and come back" | A | drive mocks inline |
| GEN-09 | Non-UI coverage, doctrine:75 | 6 keys, second round | R | fold into GEN-03 (2 keys duplicate) |
| GEN-10 | MENUS, doctrine:36-48 | one AskUserQuestion per open dimension (5–13) | R | ask only genuine forks (tie in rank, strong minority, priced vendor); auto-pick rest |
| GEN-11 | priced vendor dims | paid service choice | K | |
| GEN-12 | FINALISTS race or skip, driver:2757 | nobody is named as decider | R | one question with cost line, default derived from whether a stack fork remains |
| GEN-13 | PICK winner, doctrine:97 | user hand-edits `## Picks` | K + R | make it an AskUserQuestion with ranked finalist first |
| GEN-14 | DECIDE hard forks, doctrine:154 | re-asks dimensions already picked | R | fire only for still-unresolved dims |
| GEN-15 | ops-conventions ADR, doctrine:129 | 9 rows | A ×8, K for `success-metric` | move success-metric into discovery |
| GEN-16 | design hard forks, doctrine:161-164 | nav shell, layout, color schemes, a11y, token tiers — **orphaned: no driver step asks** | R | one design-direction round at DESIGN_BRIEF |
| GEN-17 | SKELETON no remote, doctrine:250 | connect remote or CI-inert | K, move | ask at DISCOVERY; dedupe with INI-03 |
| GEN-20 | AWAITING_DESIGN_APPROVAL | literal `approve` in Storybook | K | |
| GEN-21 | ROADMAP confirm, doctrine:381 | approve sequence table | R | notify + veto window; keep milestone gates as the one asked item |
| GEN-22 | picture round, driver:3032 | send screens to client service? | R | one question with default |

### 2.2 Mocks, prototype, init, enforce, connect

| ID | Step | What is asked | Verdict | Change |
|---|---|---|---|---|
| MOC-01 | SEED idea | asked again even when genesis brief exists | A | read `.claude/genesis/brief.md` |
| MOC-03 | ledger product rows | implicit; re-blocks at 3 marks | R | one batched "N assumptions — ok or correct" round |
| MOC-04 | terminal journey confirm | one `approve` per journey | R | show all journeys, approve all / name changes |
| MOC-05 | service client review | end turn, wait for client | K | |
| MOC-06 | pulled notes | per note | A, escalate product-scope notes only | |
| MOC-07 | waive absent client | undefined decider | K | make explicit |
| MOC-08 | connect suggestion | surfaces at every terminal step | R | ask once up front with default (terminal) |
| PRO-01 | stem | `📌 Auto-picked` | A (already — the exemplar) | |
| PRO-02 | missing `prototype` block | undefined decider | R | derive, confirm once |
| PRO-04 | pin loop | literal `approve` | K | |
| PRO-06 | approved with no behaviour pins | refusal, no question | R | ask with recommended route |
| PRO-07 | `--mark closed` deletes worktree/branch/db | | K for abandon | |
| INI-01 | profiling interview | unbounded | R | one batched round |
| INI-02 | `[NEEDS CLARIFICATION]` in generated skills | buried | R | surface in INI-01 or report `warns` |
| INI-03 | git remote / CI | | K | dedupe with GEN-17 |
| INI-04 | testCommand vacuous pass | "accept risk or fix" | A | fix + notify |
| INI-05 | at-risk leg applicability | | A | notify |
| INI-07 | legacy genesis canon STOP | | A | chain |
| ENF-02 | ambiguous enforcer | per cell | R | tie-break by lockfile → native → fewest deps; ask only toolchain changes, batched |
| ENF-03 | baseline rewrite confirm | per cell | K + R | one confirm for all cells; notify-only on a fresh scaffold |
| ENF-04 | propose missing rules | per gap | K + R | one batched round, recommended defaults |
| CON-01..03 | connect / login / team | | K | |

### 2.3 Plan, run, review, fix

| ID | Step | What is asked | Verdict | Change |
|---|---|---|---|---|
| PLAN-02 | forks during explore, plan.md:40 | one at a time, mid-draft | R | collect after draft; one ≤4 round, recommended default each |
| PLAN-03 | `[NEEDS CLARIFICATION]` at lock | | R | fold into PLAN-02; explore first |
| PLAN-04 | decision-lint `[asked:]` | forces a question per restriction | R | auto-tag `[guards:]` on Risk Tiers match; rest into PLAN-02 |
| PLAN-05 | critical-tier lock confirm, core.md:58 | **rule exists only in core; plan.md has no step** | K → add the step | summary + "lock (Recommended)" |
| PLAN-06 | spec-number collision | | A | renumber the unbuilt one |
| PLAN-07 | Assumption fallback "STOP, ask the user" | pushes a question into build | R | ask at plan time |
| RUN-01 | worktree cannot be created, run.md:36 | dead stop | R | question: exit other worktree / `--in-place` / abort |
| BLD-01 | red-check anomalies, stage-build.md:29 | "diagnosed with the user" | A for mixed-pin, skipped-resume; R for unsanctioned-green | model diagnoses, notify; ask only on critical |
| BLD-02 | `blocked` returns | per worker | R | auto-pick when Assumption has a fallback; batch per wave |
| BLD-03 | out-of-plan gate file | `📌` on standard, ask on critical | A (already) | |
| BLD-04 | baseline files "STOP for a person" | mid-build | K, move | batch with BLD-05 |
| BLD-05 | REPLAY "close enough" literal | | K + R | free-form approval; side-by-side page |
| BLD-06 | ESCALATE repair cap 3 | user must know to delete a file | R | one question: re-arm / restart cold / queue fix / amend spec |
| REV-01 | STOPPED red leg | terminal; user restarts | R | capped in-session repair or auto-queue `/spec:fix` |
| REV-02 | waive / reject dispositions | per hard finding | reject A; waive on verbatim Decision quote R (notify+veto); waive on out-of-scope or critical K | the ledger `checkpoint.overrides` count tells whether asking pays |
| REV-03 | evidence rule "presented to the user" | | R | report listing, not a question |
| REV-04 | ESCALATE fix cap 2 | | K + R | one question listing open findings |
| REV-05 | "confirm waived in close report" | redundant with REV-02 | A | plain notice |
| REV-06 | merge strategy | `📌` derived | A (already) — **contradicts GIT-06** | |
| REV-07 | non-trivial conflicts | | R; genuine logic clash K | propose combination first |
| REV-08 | never push | implicit | K | name push as next action in report |
| FIX-02 | dirty tree STOP | | R | commit / stash / abort |
| FIX-03 | lane STOP (new behaviour, schema/API) | bare stop | R | hand off with root-cause as the next command's input |
| FIX-04 | decisions stop over strings and policy | one round | strings copying house pattern R; policy K | |

### 2.4 Release, queue, status, doctor, git

| ID | Step | What is asked | Verdict | Change |
|---|---|---|---|---|
| REL-01 | first-release config fields | batched ≤4 | K (already reshaped) | |
| REL-03 | migrations check command | separate question | R | fold into REL-01 |
| REL-04 | live third parties → inert rows | hidden question | K + R | one confirmation per release, re-ask on delta only |
| REL-05 | journey cannot be walked | terminal | R | ask for access/seed instead of stop |
| REL-06 | red leg STOP | | A | auto-queue `/spec:fix` |
| REL-07 | promote to production | | K | |
| REL-09 | production verify fails | **no rollback question exists** | K — add | |
| Q-01 | groom | per flagged item | R | tick hard-evidence items with `📌`; ask ambiguous |
| Q-02 | near-duplicate refusal | exit 2 | A | model compares payloads |
| ST-01 | status decide lines | narrated only | K + R | make them questions whose options write the queue |
| DOC-02 | `--fix` patch approval | per patch | R | notify-and-proceed for plugin-generated files with executed evidence; ask for user prose |
| DOC-03 | test-expiry apply | one question | K (keep) | |
| DOC-04 | collision renumber | | A | |
| GIT-02 | escape-row class | | A | classify from diff; `null` fallback |
| GIT-03 | ambiguous source branch | | R | recommend the one `spec/*` branch ahead |
| GIT-05 | dirty tree STOP | | R | commit / stash |
| GIT-06 | merge strategy "always ask", merge.md:43 | | A — **contradicts REV-06**; heuristics differ from `merge-back.sh:262-265` | one rule, `📌` |
| GIT-07 | conflicts | | R | proposed combination first |
| GIT-09/10 | abort / force-push / push | | K | |

---

## Part 3 — Silent decisions that should become questions

Ranked by harm if wrong. "When" is where the question belongs.

| # | Policy (anchor) | Current default | Suggested question | When |
|---|---|---|---|---|
| 1 | `/git:commit` stages sensitive files — "warn but still stage them" (commit.md:110); `git add -A` mandatory (:13, :106) | stage everything | Hard stop on `.env*`/credential patterns: "These look like secrets: … exclude (Recommended) / stage anyway" | per commit |
| 2 | Release: production verify fails → GATE_RED, no rollback (release.md:125-134) | stop | "Production is unhealthy. Roll back to <prev build> (Recommended) / leave / investigate" | per release |
| 3 | Critical-tier lock has no confirm step in plan.md (core.md:58) | silently locked | add the lock confirmation | per critical spec |
| 4 | Risk Tiers authored from code only (init.md) | derived | "Which of these are high-risk here: auth, money, migrations, data deletion, public API, PII?" | init |
| 5 | `breaking:` frontmatter has no reader anywhere | ignored | at lock: `breaking: true` requires an `[asked:]` Decision; at release list breaking specs and ask about version bump | lock, release |
| 6 | Dependency additions — nothing asks or prints (no hit in commands/doctrine) | silent | File Plan row touching a manifest/lockfile → `📌 adds dep X (license, downloads)`; ask only on `tier: critical` | plan |
| 7 | Schema migrations — only via host Risk Tiers | silent unless host listed it | non-empty Data Model → force critical + "existing rows affected? backfill? rollback?" Decision | plan |
| 8 | Prototype auto-closed (db, worktree, branch deleted) when the last citing spec closes (review driver finishMerge) | delete | notify + proceed listing unmerged commits; ask if any | review close |
| 9 | Worktree-per-spec, Direct lane commits straight to main, merge strategy auto-pick (run.md, core § Pipeline Entry, stage-review:85) | fixed | one init question "git workflow": worktree default / allow direct-to-main / merge shape | init, stored in config |
| 10 | Test expiry classification is "required" with no off switch (grounding-contract § Test expiry) | always on | "Retire per-spec tests after close? keep (Recommended) / never classify" | init |
| 11 | Review runs the whole suite twice per close (review-close.md) | fixed | when suite > N min: "run twice / scope to touched tests" — the doc promises a knob that does not exist | init |
| 12 | Hosted walkthrough service: screens and notes leave the machine; `/spec:connect` edits `.gitignore` | opt-in but never offered or disclosed | at `/spec:mocks` start: "confirm stories in terminal (Recommended) / review with a client on the hosted service — uploads screens" | mocks start |
| 13 | Genesis design forks (nav shell, layout system, color schemes, a11y baseline, token tiers) — doctrine mandates a question, no step asks (genesis.md:161-164) | Fable decides | one design-direction round | DESIGN_BRIEF |
| 14 | Package manager, test runner, linter, typechecker required in descriptor but not floor dimensions (genesis-driver.js:1909) | filled at DECIDE | fold into the MENUS round as auto-picks with `📌` | genesis |
| 15 | Locale / i18n scope has no coverage key (`localeScope: null`) | absent | add coverage key `locale` | discovery |
| 16 | `/spec:init` creates substrate in host source (health endpoint, seed script, README section) (init.md:63-80) | writes | "Init will create: … proceed / declare inert instead" | init |
| 17 | Generated agents get `permissionMode: acceptEdits`, settings allowlist merged (init-gen.js:341, 545-576) | writes | print the permission diff, confirm once | init |
| 18 | Ledger rows and escape rows committed into the host repo (core § Feedback Loop) | commit | "record run history in `.claude/spec-runs.jsonl` committed (Recommended) / gitignored" | init |
| 19 | Review close edits host canonical docs, Gotchas, agent-memory silently (stage-review:68-84) | silent | notify lines in the close report, one veto window | close |
| 20 | `/spec:fix` lets the session decline its own reviewer findings; review stage says only the user waives | inconsistent | same rule both lanes | fix |
| 21 | Model/effort per seat hard-coded (Part 1) | fixed | `.claude/spec.config.json` `models` block with defaults from 1.3; init prints it once | init |
| 22 | Cost before heavy runs (`/spec:run` waves, `/spec:enforce` fan-out, genesis race) | no estimate | one line "≈N agent dispatches (model mix) — go/no-go" before start; a question only for the genesis race | per run |

Gaps with no surface at all (nothing asks, notifies or lints): security-sensitive paths (auth,
crypto, CORS, secrets handling) have no reviewer lens; data deletion/purge has no plan-time
trigger beyond host Risk Tiers; roadmap completeness ("beats F–G have no spec") is never shown;
`fleet-reader` reads other repos' ledgers without saying which.

---

## Part 4 — Contradictions to settle in doctrine

1. core.md § Model Placement: planner is Fable (line 140) and the builder session is Opus (line
   144) and Sonnet is every worker (line 142). Three sentences, three answers.
2. core.md:146 puts genesis judgment seats on Opus; genesis.md:39-43 requires Fable for every
   design step. core.md:141 puts every mock on the planning model; mocks.md:9 says Sonnet.
3. stage-review.md:85 "merge strategy is derived, never asked" vs merge.md:43 "always ask";
   their commit-count heuristics differ from `merge-back.sh:262-265`.
4. core.md:58 "the user confirms the lock" on critical tier; plan.md has no such step.
5. Only `/spec:fix` flips the reviewer model for a Fable session; `/spec:run` does not.
6. question-style-gate's product-stage exemption suppresses the "derive" verdict for every
   genesis/mocks question — the one mechanism that would flag GEN-10/GEN-15 as derivable is
   switched off exactly where most questions fire. Any auto-pick push in genesis must revisit it.
7. ADR numbering: two files are `0020-*`.

---

## Part 5 — Proposed order of work

Each item is one spec. Ordered by harm-if-left, then by how many human turns it removes.

1. **Model placement refresh** — Part 1.3 + 1.4: reviewer/disposer/judge model+effort, explicit
   dispatch models in review and fix, genesis Fable stop → subagent dispatch, core.md § Model
   Placement rewrite, prompt-hygiene pass (drop emphasis, add turn-ending and real-check
   paragraphs), three test pins.
2. **Safety questions that do not exist yet** — Part 3 #1, #2, #3, #8: secrets at commit,
   rollback at release, critical lock confirm, prototype close notify.
3. **Plan-time structural triggers** — Part 3 #5, #6, #7: `breaking:` reader, dependency notice,
   migration → critical.
4. **Genesis question diet** — GEN-02/03/08/09/10/14/15/16/21, MOC-01/03/04/08: batching,
   recommend-first, orphaned design round, inline mocks. Revisit the gate exemption (Part 4 #6).
5. **Build/review stops → questions with defaults** — RUN-01, BLD-01/02/06, REV-01/04/05, FIX-02/03,
   REL-05/06, GIT-03/05/06 (merge one rule).
6. **Init-time policy block** — Part 3 #4, #9, #10, #11, #12, #16, #17, #18, #21, #22: one
   `/spec:init` round of ≤4 questions ×2, stored in `spec.config.json`, read by run/review/commit.

Reports behind this document (session scratch, not retained): model research (Opus, 43 tool
calls, live docs), question catalog A (Opus, genesis half), question catalog B (Opus, plan→git
half), model-routing audit (Sonnet), silent-defaults audit (Sonnet, all 36 ADRs), Claude Code
docs lookup (claude-code-guide). Unverified items are marked in Part 1 where the sources
conflicted: whether Fable 5.1 benefits from verification reminders; sycophancy data for 5.5
models; Mythos access programme.
