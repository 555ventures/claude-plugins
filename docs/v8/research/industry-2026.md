# Industry structural methods for reliable agent code, late 2026

Researched 2026-11-04. Evidence tags: M = measured (independent or paper), V = vendor-claimed, A = anecdotal. Many vendor pages gave no numbers; "none found" means exactly that. Amp, Augment and Kiro-EARS/hooks details came mostly from secondary pages (flagged).

## Per tool

**OpenAI Codex (cloud + CLI)**
- Layered AGENTS.md (global, repo, subdir; nearest wins), kept short, grown only after repeated mistakes. https://learn.chatgpt.com/guides/best-practices (formerly developers.openai.com/codex/learn/best-practices). Evidence: none found.
- Every prompt carries a "Done when" and test/lint commands; Plan mode, PLANS.md for long work, `/review` and a team code_review.md. Same page. V: OpenAI says Codex reviews 100% of its PRs; no other numbers.
- Worktree isolation for parallel and scheduled tasks; subagents for bounded side work. Same page.

**GitHub Copilot coding agent**
- Custom agents in `.github/agents/`, hooks (`preToolUse`, `postToolUse`, etc.) in `.github/hooks/`, a default-on network firewall, and built-in self-review plus security scan before PR. https://github.blog/ai-and-ml/github-copilot/whats-new-with-github-copilot-coding-agent/ , https://docs.github.com/en/copilot/reference/hooks-reference. Evidence: none found; docs do not say what self-review checks.
- ReviewBench, an offline review benchmark (grounded precision/recall). https://github.blog/ai-and-ml/github-copilot/reviewbench-an-open-benchmark-for-ai-code-review/

**Spec Kit (GitHub)**
- Staged artifacts: constitution (once) then specify, plan, tasks, implement, and a `converge` command looped "until Converged" (the only documented stop condition). https://github.com/github/spec-kit . Evidence: none from GitHub. A vendor blog (Uvik) reports 40 of 50 tickets merged; low trust. Critics: no verification loop (codemyspec.com/blog/spec-kit-vs-kiro).

**AWS Kiro**
- Three files per spec (requirements or bugfix, design, tasks), each phase human-gated; bugfix specs record current, expected and unchanged behavior. https://kiro.dev/docs/specs/
- tasks.md is a dependency graph; independent tasks run in concurrent waves. Same page. V: "cuts execution time significantly", no data. (EARS notation and hooks: secondary sources only.)

**Cursor**
- Plan Mode: research, clarifying questions, plan, wait for approval. Secondary sources only.
- Bugbot: separate reviewer that learns rules from PR feedback and spawns a cloud agent to test a fix. https://cursor.com/blog/bugbot-learning . V: resolution rate 52% (Jul 2025) to 78% over 50,310 PRs, LLM-judged, public repos only.
- Parallel agents in worktrees or cloud VMs; `.cursor/rules/`, per-folder BUGBOT.md. Secondary.

**Amp**
- Oracle (second-opinion reasoning model), Search, Librarian subagents with isolated context returning summaries only. https://ampcode.com/news/custom-agents , secondary guides. Evidence: none found.

**Devin (Cognition)**
- Verification as its own stage: test plan grounded in source, expected result logged before acting, labeled pass/fail/untested assertions, deterministic setup scripts saved as repo "testing skills". https://cognition.com/blog/testing-development . V: approved test runs per day more than doubled; flakiness "dropped dramatically", no figure. Known failure: agent cheats by running JS instead of clicking.
- Devin Review/Autofix: review and fix before the PR opens. https://cognition.com/blog/introducing-devin-2-2

**Google Jules / Gemini CLI**
- Planning Critic: a second agent critiques the plan before execution. https://jules.google/docs/changelog/ . V: 9.5% fewer task failures.
- Plan mode is read-only, writes plan.md, approval exits it (Gemini CLI default since v0.34). https://geminicli.com/docs/cli/plan-mode/ . Note: Gemini CLI was superseded by Antigravity CLI for free users on 2026-06-18.

**Aider**
- Architect/editor split (one model plans, another edits) and auto-test/auto-lint loop. https://aider.chat/2024/09/26/architect.html . M (2024, vendor benchmark): o1-preview architect + o1-mini editor 85% on Aider's edit benchmark. Dated.

**SWE-agent / OpenHands / Agentless**
- Trajectory critic for best-of-N, early stop, refinement. https://www.openhands.dev/blog/20260305-learning-to-verify-ai-generated-code . M: Best@8 73.8% vs random 57.9% (mixed-outcome SWE-bench Verified subset); a benchmark-trained critic scored AUC 0.45-0.48 on production outcomes (random).
- Agentless: fixed localize/repair/validate pipeline, no agent loop. SWE-Effi finds it top on resolve rate but expensive; SWE-Bench Pro finds it weak on multi-file edits. Different setups, not comparable.

**Replit Agent 3**
- Browser-driven self-testing with visual replay; a separate testing sub-agent (GUVI blog only). https://docs.replit.com/core-concepts/agent/app-testing.md . V: 200+ min autonomous runs; no quality measurement.

**Factory**
- Droids pipeline SPEC, TEST (red), IMPLEMENT (green), VERIFY (third-party write-up). V (2024 report): 21.75% vs Aider 18.9% vs Devin 13.86% on a SWE-bench subset. https://factory.ai/news/code-droid-technical-report

**Augment (Intent)**
- Coordinator drafts a living spec and tasks, parallel Implementors in worktrees, Verifier checks output against the spec, three human gates. https://www.augmentcode.com/guides/spec-driven-ai-code-generation-with-multi-agent-systems . Evidence: none found. Critique (specdriven.com): the spec may bend to match what the agent built.

**Cross-cutting research**
- CR-Bench-v2 (https://arxiv.org/html/2611.02566): best review agents find about 33% of known defects; a commercial agent had 78% "useful" comments but 8.1% recall; Reflexion-style self-reflection raised detection for every backbone (significant in 8 of 12 pairs); LLM judges agree on direction, not magnitude; Python-only, LLM-labeled.
- c-CRAB (https://arxiv.org/abs/2603.23448): all review agents combined solve about 40% of tasks.
- TDAD (https://arxiv.org/pdf/2603.17973): bare "write tests first" instructions raised regressions from 6.08% to 9.94%; graph-based impact analysis naming which tests to run cut them to 1.82% (100 SWE-bench instances).
- TDFlow (secondary, unverified): human-written tests 94.3% vs agent-written 68.0%.
- Worktree studies (AgenticFlict, "Passes Alone, Fails Together"): worktrees defer conflicts to merge; clean textual merges can still break behavior.
- Not found: any study of same-model reviewer self-preference bias or of a builder/reviewer split as such.

## Synthesis: ten recurring ideas

| # | Idea | Who | Evidence | Cost (3.6k-LOC Node plugin) | A/B on 3 fixed specs, blind judge |
|---|---|---|---|---|---|
| 1 | Staged human-gated artifacts (spec, plan, tasks) | Kiro, Spec Kit, Augment, Codex PLANS.md | Vendor-claimed; no independent measure | Small (probably already present) | Arm A: full stages; B: spec then straight to build. Judge scores diffs against a hidden acceptance list. |
| 2 | Critic on the plan before code | Jules (-9.5% failures), Cursor/Gemini plan approval | Vendor-claimed (one number) | Small: one reviewer pass over plan.md | Run with and without plan critic; judge counts spec requirements missed in final code. |
| 3 | Fresh-context reviewer separate from builder | Devin Review, Bugbot, Copilot, Amp Oracle | Vendor-claimed (Bugbot 78%); CR-Bench shows ceiling ~33% recall | Small-medium | Seed each spec's output with known planted defects; compare recall with and without reviewer; judge blind to arm. |
| 4 | Reviewer self-reflection / second pass | CR-Bench-v2 | Measured (significant 8/12) | Small: re-prompt reviewer once with its own findings | Reviewer with one reflection pass vs none; measure recall and false-positive rate on planted defects. |
| 5 | Executed verification, not read-only review (tests, browser, expectations logged first) | Devin, Replit, Aider auto-test, Copilot | Vendor-claimed; Devin notes cheating risk | Medium: gate script that runs commands and records pass/fail/untested | Arm B adds a mandatory run-and-record stage; judge checks whether claimed-done items actually run. |
| 6 | Tell the agent which tests/checks matter (targeted impact), not generic "do TDD" | TDAD | Measured (6.08% to 1.82%; generic TDD worse at 9.94%) | Medium: map changed files to tests | Arm A: generic test-first prompt; B: named test list per task; count regressions in a hidden suite. |
| 7 | Short, grown-from-failure rules file (AGENTS.md style) with explicit "done when" | Codex, Cursor rules, Copilot, Bugbot learned rules | Vendor-claimed / anecdotal | Small (mostly deletion-friendly) | Full rules vs trimmed rules vs none; blind judge on rule violations and diff size. |
| 8 | Worktree isolation for parallel lanes, with post-merge gate | Codex, Cursor, Kiro waves, Augment, Devin | Measured that conflicts are only deferred | Already built (fanout); add post-merge semantic check | Run the three specs serial vs parallel; judge compares final merged behavior against hidden cross-spec tests. |
| 9 | Best-of-N or critic-scored retry with early stop | OpenHands | Measured (73.8% vs 57.9%) | Medium-large: needs a scorer; cost multiplies | Run N=3 builds per spec; pick by reviewer score vs random; judge ranks picks. Likely too costly for this plugin. |
| 10 | Spec-level verifier that checks output against the spec and flags spec drift | Augment Verifier, Spec Kit converge, Kiro bugfix "unchanged behavior" | Vendor-claimed; critics note drift risk | Small-medium: checklist from acceptance criteria | With and without converge pass; judge counts unmet criteria and unauthorized spec edits. |

## Reading the evidence

- Only four ideas have independent numbers: reflection on review (4), targeted tests (6), critic-ranked best-of-N (9), and worktrees deferring conflicts (8). The rest are vendor claims.
- Largest transferable and cheap: 2, 4, 6, 10. Highest-value but costlier: 5 (the best-supported "does it actually run" signal).
- Caution from measurements: generic instructions (plain test-first) can hurt; high comment usefulness does not imply recall; judges disagree on magnitude, so use one fixed judge per experiment and compare only within it.
- Judging protocol sketch: three fixed specs, N>=3 runs per arm, arm labels stripped from diffs, a single judge model plus a hidden test or planted-defect list as the objective anchor so the judge is not the only signal.
