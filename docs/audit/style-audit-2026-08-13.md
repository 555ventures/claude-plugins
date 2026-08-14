# Style-contract audit of all 19 commands — 2026-08-13

Four parallel read-only audits over `spec/commands/*.md` (16) + `git/commands/*.md` (3), one lens each:
question style, console-output style, action-orientation (close-the-loop), over-fitting.
Contract sources: `spec/doctrine/shared.md` § Question Style (L803–869) + § Console Output Style (L870–912), `style/STYLE.md`.
Status: findings only — nothing edited. Raw agent reports live in the session transcript; this file is the durable synthesis.

## Root cause (one sentence)

The contract is prose-only: exactly one command's report ending is test-pinned
(`tests/consistency/conflict-fixes.test.js:236` — genesis-design.md), so every other drift below survives the full suite.

---

## Class A — findings commands don't close the loop (action-orientation + output style)

8 of 16 spec commands end off-contract on the terminal `Next:` line; the four commands whose entire
output IS findings are the four that fail to stage the fix.

| # | Locus | Defect | Minimal fix |
|---|---|---|---|
| A1 | `spec/commands/review.md:455-456`, template `:376-382` | Doctrine explicitly forbids a Next pointer on non-CLEAN closes; 🚫 arm ends on a findings dump + ledger path | `Next: /spec:build {specPath} — fix the {N} hard findings` (sanctioned literal same-spec chain) |
| A2 | `spec/commands/review.md:372-383` + Phase 4 `:389-441` | Verdict prints, then the whole interactive merge-back sequence prints BELOW it — verdict buried mid-output | Re-print one-line verdict contiguous with the § Next pointer after Phase 4 step 7 |
| A3 | `spec/commands/escape.md:150-161` | No `Next:` in template; "Then stop." sanctions ending with ball in user's court; leads 📦 not ✅; ✨ line is pure pipeline jargon | Terminal `Next: {step-6 prevention-delta command, else spec-status --next verbatim}`; lead ✅; plain-English ✨ line |
| A4 | `spec/commands/audit.md:129-138` | `Next:` conditional on an `enforcer` fate — the common run ends on `📦 ledger:` path; a hand-written `/spec:plan NN` here would repeat the 2026-07-22 freehand-next incident | Unconditional Next: enforcer fate → `/spec:enforce`; else `spec-status --next` verbatim (picks up the brief just written); else explicit nothing-needed |
| A5 | `spec/commands/atlas.md:38-47, 94` | Template has no `Next:` in any arm AND fires at step 1 of 5 — the run's actual last output is unspecified; only command with no defined terminal console state | Add `Next:` arm (sweep / sketch / nothing-needed); make `:94` "rebuild and report" cite the same template as the terminal print |
| A6 | `spec/commands/init.md:521-534` | No `Next:`; report ends on unbounded ⚠️ list; four dense identifier-dump bullets (`{kind → name}` maps, `designRulesHash`) | Collapse inventory to 2 plain lines; terminal `Next: /spec:enforce — mechanizes the rules init just wrote` |
| A7 | `spec/commands/release.md:190-203` | Terminal action is `🧹 next (optional):` — off-anchor emoji, demoted to suggestion; 🚫 blocked-promotion arm has no remediation pointer; `{inert rows, verbatim}` raw dump | `Next:` unconditional, branched green→`/spec:audit` / 🚫→named remedy; gloss inert rows |
| A8 | `spec/commands/release.md:119-125` + `review.md:147-163` | Failure/STOP paths have NO template at all — bare enum tokens (`GATE_RED`), free-form prose, symmetric "direct fix or a spec" menu | Two-line STOP template each: `🚫 **{leg} failed — {plain consequence}**` + `Next: {named remedy}` |
| A9 | `spec/commands/enforce.md:250-251` | `Next: re-run the host gate once` — no pasteable payload though `gateCommand` is in hand; also the terminal output of a fresh `/spec:init` | Print resolved `gateCommand` verbatim; when invoked by init, follow with `spec-status --next` |
| A10 | `git/commands/enter-worktree.md:41` + `merge.md:29,90-92` | enter-worktree ends "Done."; merge ends on a CWD-warning caveat; dirty-tree STOP names no unblock | 4-line terminal templates; STOPs stage one action (`/git:commit` or `git stash -u`, recommended first) |
| A11 | minor: `build.md:273` vs `:285` duplicate Next (divergent slots) · `genesis-design.md:227` two-command chain on one Next line (architect `:291` splits Next/Chain correctly — but Chain prints BELOW Next there; fold or reorder) · `doctor.md:356-378` clean arm "no action" is a droppable slot · `sketch.md:56-58` bound-surface STOP no reroute payload · `status.md:76-78` two anomaly classes get prose advice while the sibling class offers the staged edit · `plan.md:64-66` T1 rejection ends "just ask me to do it" | delete/fold/one-line each |

Clean reference implementations: `plan.md:315-321` (spec-status --next verbatim, sole-derivation note), `design.md`, `genesis-explore.md`, `genesis-architect.md` (modulo Chain-below-Next), `git/commands/commit.md`.

## Class B — question style: the "recommend a default" half of the contract is unimplemented (and thrice contradicted)

Systemic: `grep -rn "📌\|Auto-picked"` over both command dirs returns **nothing** — the loud-derivation
announce line exists only in shared.md:856 and the gate script. Every command implements ask-less with none of announce.

| # | Locus | Defect | Minimal fix |
|---|---|---|---|
| B1 | `spec/commands/review.md:313-317` | "recommend nothing" — literal instruction to hand a symmetric Fix/Waive/Reject menu; "per finding group" uncapped | Recommend the evidence-implied disposition; batch ≤4 per call |
| B2 | `spec/commands/doctor.md:337-338` | "Per-patch AskUserQuestion… Never batch-approve" — guarantees 5–15 sequential calls | Batched ≤4 patches/call, each showing before→after; forbid only blanket approve-all |
| B3 | `spec/commands/build.md:202-207` | "(Recommended) **may be** marked… decision is the user's" + "symmetric options" — the escalation path is ball-in-court by construction | "is marked"; symmetry belongs to the brief, never the question |
| B4 | `spec/commands/genesis-architect.md:41-43` vs `:79-81` | Self-contradiction: "neutrally worded" vs "recommended-first" in the same command | Recommended-first except vision/taste dimensions; strike "neutral phrasing" |
| B5 | `git/commands/merge.md:35-45, 57-60, :17` | Strategy question asked though the answer's derivation table is printed 3 lines below; conflict options symmetric with unglossed `ours/theirs`; branch disambiguation forbids recommending | Derive + 📌 announce + confirm with recommended-first; gloss branches concretely |
| B6 | Jargon in questions: `init.md:82` ("which surfaces do you consider T3?" — enshrined as the example), `init.md:162` ("declare CI inert"), `sketch.md:42-100` (surfaces block / gap-sketch-ratified / bare "ratify?"), `atlas.md:69` (bound region / coverage ledger / drift handling), `review.md:411,426` (ff-only / rebase-ff unglossed), `build.md:35,168,282` (frontmatter keys, "mini-batch", `ExitWorktree` as an option label), `design.md:186` (affordance/contract), `enforce.md:123` (citations instead of consequences), `release.md:36-41` (5 fields > 4-question cap), `:143` (bare yes/no promote), `audit.md:96-102` (four-way menu, no default), `:58` (mechanize vs keep — derivable at ≥2 recurrences), `plan.md:92,54` ("interview", symmetric "which is right?") | Per-site one-line rewrites recorded in session transcript; all follow: gloss in plain English + recommended-first + consequence per option |
| B7 | Asks-nothing-but-should: `enforce.md:165-176` repo-wide format write-mode pass with zero human confirm · `review.md:431-433` branch+worktree deletion auto-triggered by CLEAN with no decision point · `audit.md:109` writes a roadmap brief with no preview (sibling `rule-row` fate requires one) | Add the one confirm each (fold into existing calls where possible) |

Clean: `escape.md` (repo exemplar, end-to-end derive+cap), `status.md`, `git/commands/commit.md`, `genesis-explore.md`.

## Class C — over-fitting: this-stack assumptions that fail silently in other hosts

| # | Locus | Defect | Minimal fix |
|---|---|---|---|
| C1 | `review.md` Phase 0 steps 5–6 | `ac-matrix` + `skip-reconcile` verdict legs are LLM-hand-computed (regex lint, grep joins) then fed to `verdict.js` as authoritative — the "strict downgrade" § Rule Enforcement itself names | Extract `ac-matrix.js` behind a spec-paths key; doctrine shrinks to invocation lines |
| C2 | `review.md` step 3 | "every mainstream runner prints skip counts" — false for go test, cargo, pytest w/o `-rs`, Gradle; silently records 0, the exact UpWell failure (ledger row 34) | Host-declared skip-report format in config, else leg = `unavailable`, never assumed-zero |
| C3 | GitHub hardcoded as the forge (`ci-query.js`, `doctor.md` check 19, `escape.md` gh-run-view, `release.md` Phase 2, `status.md` observe-ci) | On GitLab/Bitbucket hosts the whole CI-observation organ is inert AND silent — qualifier stops carrying information | Forge adapter command in config; minimum: doctor reports "CI observation inert: no supported forge adapter" |
| C4 | `doctor.md` check 19 | Deterministic algorithm (split/trim/≥10-char substring match) written as prose for the model to hand-execute; test pins the paragraph, not behavior | ~30-line script behind spec-paths key |
| C5 | `init.md` Phase 3 monorepo rule | Triggered on `pnpm-workspace.yaml`; uv/Go/Cargo/Gradle workspaces have the identical class and never fire it | Generalize: "more than one test-collecting package/module"; vitest string → parenthetical |
| C6 | `release.md` Phase 2 | 30s × 10min CI poll constants — hosts with longer CI permanently land `in-progress`/CLEAN-with-qualifier noise | Config keys with current values as defaults |
| C7 | `design.md` naming taboo | `<surface>-screen` naming rule = incident patch for a fidelity-gate misdiagnosis; class (regionRef over-claim) is mechanically detectable in `fidelity-check.js` | One class-level sentence + detection in the script |
| C8 | `init.md` Phase 1 | Storybook/Widgetbook enumerated by name — violates enforce.md's own never-name-a-tool rule; Ladle/Histoire/preview hosts silently lose the whole design pipeline | Capability-shaped detection; names as parentheticals |
| C9 | `enter-worktree.md` step 1 + `doctor.md` check 11 | Branch derivation duplicated in two prose copies, each claiming `merge-back.sh` owns it — it doesn't (takes `--source` pre-derived) | `merge-back.sh branch-for <spec path>`; both call it |
| C10 | `doctor.md` checks 16/17 | Version-pinned legacy migrations not gated on `generatedBy` (which check 15 already compares) | Gate on version or delete per the one-major-version window |
| C11 | `review.md` step 3 inert-falsifier | Bootable-entry-point shapes are shell/Node-flavored (bin/, shebang, daemon); Go/Java/Flutter/Lambda mains match none | Generalize + `inert` declarations name what they excluded |
| C12 | `doctor.md` check 12 | ~1000-char line threshold derived from this repo's path lengths; next leg added crosses it while conforming | Schema/type check primary; length secondary tripwire |
| C13 | `genesis-explore.md` setup + `atlas.md` step 3 | Closed 2-tool screenshot list as a hard STOP (test-pinned names); `python3 -m http.server` named | Capability-shaped probes; names only in remedy text |

Deliberately NOT flagged (sanctioned): dated incident citations with class-level rules, plan.md's illustrative shapes, init.md's jsonc examples, pinned observed-string formats, ledger-conditioned scaling constants, commit.md's NON-NEGOTIABLE trailer.

## Class D — structural gaps (the holistic fixes)

| # | Gap | Fix shape |
|---|---|---|
| D1 | No enforcement carrier for either contract — one pinned Next line repo-wide | One consistency test over all `*/commands/*.md`: every fenced report template's first line matches `^(✅\|⚠️\|🚫) \*\*`, last non-empty line matches `^Next:` (or spec-status-verbatim / explicit nothing-needed), anchors ∈ fixed set; `status.md` exempted per doctrine. Scaffold-ledger row. |
| D2 | Git plugin loads no doctrine — contract-free zone by construction | `shared-for` arm reaching `git/commands`, or one-line contract citation per file + the A10 templates |
| D3 | Failure paths systematically ungoverned (every command specifies green-path template only) | The contract has no green/red distinction — one shared STOP template shape, referenced not copied |
| D4 | 📌 announce-line has no home in any report template | One `📌` slot in the shared skeleton definition (single edit in shared.md), commands inherit |

---

# Addendum: workflow-layer audit (same day, two lenses)

Scope: `spec/workflows/src/*.body.js` (6 bodies) + `fragments/*.js.frag`; generated `wf-*.js` verified in sync (`build-workflows.js --check` OK). Coverage note: only structural machinery is test-pinned (`tests/workflow-guards.test.js`); the sole prompt-prose pin reads `wf-build.body.js` alone (`tests/gate-phantom-failures.test.js:14`). Everything below is currently untested.

## Class E — workflow schemas manufacture the bad questions and starve the reports

The command-layer question/report defects (Classes A/B) are *born here*: subagent return schemas lack the fields the contracts need, so the main session freehands at report time.

| # | Locus | Defect | Minimal fix |
|---|---|---|---|
| E1 | `wf-panel.body.js:100,168-169` | Fork options go to the user VERBATIM by design — `{option, rationale}` only, no consequence field, no recommended reason; rationale is "why the panel thinks so," not "what happens if I pick this" | Extend schema: `{option, consequence(req), rationale}` + `recommended_first_reason(req)`; ten-second-cold-test clause in prompt |
| E2 | `wf-research.body.js:107-108,59` | Prompt literally instructs "do NOT lead the user"; `tradeoff` field only says what each option *costs* — contract-inverting: user gets a symmetric menu with a hidden rank field | Required `why_recommended` on rank-1; "(Recommended)" in rank-1 label |
| E3 | `wf-build.body.js:96-97` = `wf-design.body.js:83-84` | `blocked` escalations: bare-string `options[]`, undescribed optional `recommendation` — question-style obligations unreconstructable downstream | `options: [{option, consequence}]` both required; describe `recommendation` as the (Recommended) first choice |
| E4 | `wf-review.body.js:75,102` | Finding `claim` optimized for verifiability, no audience requirement — jargon flows verbatim into the report's "plain-language line" slots | Required `impact` field ("one line, plain English, no identifiers: what a user/operator sees go wrong"); template consumes `impact` |
| E5 | `wf-build.body.js:410-464` ~ `wf-design.body.js:300-353` | Four distinct exhaustion causes (agent died / no attributable failure / oscillation / ceiling) collapse into one `gate-exhausted`; dead gate agent indistinguishable from red gate; retainer briefed on nothing | `exhaustedBy` enum in return; command row branches on it |
| E6 | `wf-enforce.body.js:90-92` | `notes` optional but the report's mandatory ⚠️ fallback line consumes it — empty slot = line silently dropped = user never told a category fell back to reviewer prose | Move `notes` to required + plain-English clause |
| E7 | `wf-review.body.js:74,456-457` | Severity enum `hard/medium/soft` richer than verdict taxonomy (medium ≡ soft in verdict, but verified like hard); `FINDINGS` verdict (mediums-only) has NO outcome line in the report template | Collapse to `hard/advisory` or add the ⚠️ advisory outcome line — pick one |
| E8 | `wf-review.body.js:396-399,318-319` | `MAX_VERIFIES=12` cap and single-reviewer panel reduction are IN the return but have no console slot — CLEAN verdict carries no trace of reduced assurance | Two ⚠️ template lines (command-side fix only) |
| E9 | Silent degradation: `wf-panel.body.js:134,153` proposer/angle deaths filtered silently (3-proposer invariant loudly guarded at arg boundary, silently violated at runtime) · `wf-research.body.js:137-146` dead currency-verifier → stale versions read as fresh · `:105` 2–4 option cap unreported | `agentsFailed` in returns; throw when proposals <3; `verifyFailed` flag; `alsoConsidered[]` |
| E10 | `wf-build.body.js:86-88` | `RECEIPT.summary` required from every worker, consumed by nobody — paid tokens, dropped value | Drop from required, or feed report detail bullets |
| E11 | `runId` in every report template + runs-ledger shape, returned by no workflow | Pin the envelope contract explicitly |

## Class F — workflow correctness bugs + twin drift (not style — these bite now)

| # | Locus | Defect | Minimal fix |
|---|---|---|---|
| F1 🔴 | `spec-design-driver.js:204` → `wf-design` contract | Design gate receives the host's WHOLE `gateCommand` unsubstituted: `{testDirs}` placeholder never resolved (only build/review substitute) → literal token → gate can never pass → 4 repair rounds → `gate-exhausted` on EVERY design run of a placeholder-using host; and full test suites run against deliberately-unwired stateless components | Driver resolves a design-scoped gate (typecheck+lint legs, placeholders substituted/stripped) |
| F2 🔴 | `wf-review.body.js:133-143,318-325` | `EMPHASES[1]` (File Plan / Contracts / Decisions / AC↔test coverage / wiring) unreachable on every single-reviewer panel — the MAJORITY path; `DRIFT_NOTE` (for hosts lacking a drift script) interpolated only there, so it never fires where it's needed; contradicts review.md's "semantic backstop" claim | Append the coverage half + DRIFT_NOTE to every reviewer prompt; `EMPHASES[i]` = primary framing only |
| F3 | `wf-design.body.js:273-276` | Empty `gateCommand` → returns `stage:'complete'` — Sonnet-authored code marked done with zero deterministic verification | Distinct `complete-ungated` stage the driver refuses to mark green |
| F4 | `wf-build.body.js:320-344` | Red-check (TDD's only proof tests fail first) reads pass/fail from model's stdout reading — no sentinel — while the gate 40 lines away documents exit-code-only discipline for exactly this false-green hole | Same sentinel technique per-file |
| F5 | wf-design = drift-victim of wf-build twin | Missing vs build: deviations sidecar (forced departures lost from review's fold-in), anti-oscillation repair history (comment justifying it WAS copied, countermeasure wasn't), phantom-failure hardening (test pins build copy only); stale `digest`/`File Plan` artifact names in prompts | Extract gate-loop + HARD_RULES to fragments (the anti-drift mechanism exists, unused for its densest case); widen phantom test to both bodies |
| F6 | `wf-review.body.js:252-279` | Verifier prompt self-contradicts: step 1 mandates `git log`, closing rule forbids all git but `status` — compliant verifier refuses its own stale-worktree check → false MISCITED kills; cleanup clause claims a guarantee the command's compensating hygiene sweep exists because it broke | Allow `log`; downgrade cleanup to best-effort/orchestrator-authoritative |
| F7 | Trust-boundary gaps: `wf-build` `args.gate` deref unguarded (cryptic crash) · `wf-design` `b.kind` unvalidated (typo silently routes batch to showcase prompt) · `wf-build` `resolutions` free-text vector into prompts (the 2026 corruption class's last open door) | Extend asserts: `gate.command`, `kind` enum, `resolutions` token regex |
| F8 | Magic constants: repair ceiling `<=3` duplicated bare in two bodies; `MAX_VERIFIES=12` no ledger row/config (contrast `diffLoc>=300` which has both) · `auditKilled` kill-resurrection mechanism + smell lens have no scaffold-ledger rows (violates own doctrine rule) · panel-size doc drift (absent `diffLoc` on T3 draws 2, undocumented) | Ledger rows w/ retune conditions; one doc clause |
| F9 | Stack-shaped: verifier runner discovery names `package.json` only (Python/Go host → NOT_EXECUTABLE kills weaken the evidence gate) · `jq` + "Storybook loop" named in wf-design (widgetbook host told to look at Storybook) · `wf-enforce.body.js:109` names one MCP's method names 60 lines below its own never-name-a-tool rule | Capability-shaped phrasing throughout |

## Class G — the Fable/judgment gap has a concrete mechanical blocker

| # | Finding | Implication |
|---|---|---|
| G1 | `wf-panel.body.js:174`: the single highest-judgment seat in the workflow layer (panel aggregator → decision matrix, hard forks, ADR input) is pinned `model:'opus'`; shared.md carries BOTH "fable-first with opus fallback" and an "Opus seat" carve-out — code took the carve-out | The doctrine conflict must be ruled explicitly; today "more Fable" has no seat in any workflow |
| G2 | `fragments/dispatch.js.frag` retries only on agentType-not-found — NO model-unavailability fallback | No workflow can pin `model:'fable'` safely until dispatch grows the fallback; prerequisite for any Fable expansion |
| G3 | `effort` appears 5× across six bodies, always `'low'`, always on mechanical seats; judgment seats (review panel/verifiers, enforce research, panel aggregator) set none; § Model Placement never mentions effort | "Effort tiers deliberate" has no carrier — state the rule, set effort explicitly everywhere (mirror the existing "never inherit model" rule) |
| G4 | shared.md headlines "uncorrelated model reviews the result" but workers AND reviewers/verifiers are all Sonnet — uncorrelation only vs. the spec author; repo elsewhere calls same-model checking a defect | Rule explicitly: narrow the headline, or differentiate reviewer tier |

## Workflow roster (one line each)

wf-panel: worst question offender + silent panel degradation · wf-research: contract-inverting prompt + swallowed verify failures · wf-review: best fail-closed engineering, jargon payload + unreachable emphasis (F2) · wf-design: drift-victim twin + broken gate (F1) + ungated complete · wf-build: strongest; opaque exhaustion + unsentineled red-check · wf-enforce: cleanest; one optional-field defect · fragments: clean; the finding is what's NOT extracted into them.
