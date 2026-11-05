# Evidence for improving LLM-agent repo-level code (2025-2026)

Date: 2026-11-04. Method: extended web search; numbers are from search-result snippets and abstracts, not full-text verification. Treat every row as "reported", not "replicated". Where I found no direct measurement I say so.

## Intervention table

| # | Intervention | Effect / delta | Setting | Source | Confidence |
|---|---|---|---|---|---|
| 1 | Test-impact analysis skill (graph of tests touched by a change) | Regressions 6.08% -> 1.82% (~70% drop); resolve 24% -> 32% | SWE-bench Verified; Qwen3-Coder 30B (n=100), Qwen3.5-35B-A3B (n=25) | https://arxiv.org/html/2603.17973v1 (TDAD) | Low: tiny n, small open models |
| 2 | Test-first workflow with given tests (TDFlow) | Numbers not retrieved; framing is "tests supplied up front" | SWE-bench | https://arxiv.org/pdf/2510.23761 | Unknown; read paper before citing |
| 3 | Agent-written fail-to-pass reproduction tests | Gains come only from generated tests consistent with golden tests; misaligned tests HURT fixing | SWT-Bench-style setups | https://arxiv.org/pdf/2607.19843 ; https://arxiv.org/pdf/2601.19066 | Medium on direction; no clean resolve-rate delta found |
| 4 | Vacuous / weak tests (negative evidence) | LLM-generated tests: ~40% mutation score; 100% coverage can coexist with ~4% mutation; DeepSeek-V3.1 verified reproduction rate 10.2% | SWE-Mutation, unit-test benchmarks | https://arxiv.org/html/2605.22175v1 ; https://arxiv.org/pdf/2508.00408 | Medium: several benchmarks agree tests are weak |
| 5 | Mutation-guided test generation | Industrial deployment at Meta (mutation used to steer LLM tests) | Meta production | https://www.researchgate.net/publication/394720083_Mutation-Guided_LLM-based_Test_Generation_at_Meta | Medium; no controlled resolve delta |
| 6 | Best-of-N with hybrid (execution + execution-free) verifier | Best@16 = 49.4 on Verified (vs. much lower single-shot for the same open agent); Best@26 = 51.0 | R2E-Gym, open 32B agent | https://arxiv.org/pdf/2504.07164 | Medium-high on direction; gap to Pass@K ceiling remains large |
| 7 | Verifier-based selection generally | "Limited or inconsistent gains"; agent-confidence selection most stable; verifier Best@K far below Pass@K | Klear-AgentForge, SWE-HERO, SWE-RM | https://arxiv.org/pdf/2511.05951 ; https://arxiv.org/pdf/2604.01496 ; https://arxiv.org/pdf/2512.21919 | Medium |
| 8 | Cheaper test-time scaling (replay shared prefixes) | Up to 17.4% cost cut vs naive scaling | SWE-bench Verified | https://arxiv.org/html/2601.22129v2 | Medium; vendor-style claim |
| 9 | Separate reviewer vs self-review | Models repair their own code worst (self-correction blind spot). A single external reviewer has high variance; a second independent reviewer was within noise of single/self-refine/zero-shot | LiveCodeBench (preprint); GPT-3.5/4 repair study | https://arxiv.org/pdf/2408.10495 ; https://arxiv.org/pdf/2608.18167 | Low-medium; no SWE-bench effect size found. Practitioner guides recommend separation but are not controlled |
| 10 | Multi-agent debate for code | No credible repo-level measurement found | - | - | Gap. Do not assume benefit |
| 11 | Experience/lesson memory across tasks | ReasoningBank: 39.0 -> 49.7 with one retrieved experience; SWE Context Bench: summarized prior experience raises resolve and cuts tokens, esp. hard tasks | SWE-bench Verified; related-task benchmarks | https://arxiv.org/pdf/2509.25140 ; https://arxiv.org/pdf/2602.08316 | Low-medium: single papers, authors' own setups, contamination risk (https://arxiv.org/html/2512.10218v2) |
| 12 | AGENTS.md / repo context files | No significant resolve gain; LLM-generated files slightly negative; human-written slightly positive (~+4%); inference cost +20-23% | SWE-bench Lite + CTXbench; 3 Python repos (second study) | https://arxiv.org/pdf/2602.11988 ; https://arxiv.org/pdf/2607.27250 | Medium-high: two independent studies agree |
| 13 | Repository memory for localization | Acc@5 76.5% on Verified, +4.9 over LocAgent | LocAgent + RepoMem | https://arxiv.org/html/2510.01003 | Medium |
| 14 | Cheap fine-tuned explorer for localization | ~86% cost reduction at comparable file localization (92.7% file-level) | SWE-Explore | https://www.researchgate.net/publication/406350684_SWE-Explore_Benchmarking_How_Coding_Agents_Explore_Repositories | Low (listing only) |
| 15 | Planning before coding | No clean plan vs no-plan ablation found. Planning is the hard step; SWE-RPG agents average 31.5% when requirements are implicit | SWE-RPG; feature-addition benchmark | https://arxiv.org/html/2608.09072v1 ; https://arxiv.org/html/2603.26337v1 | Gap; weak indirect evidence |
| 16 | Spec/issue quality | Under-specified or low-detail issues: up to 40% (ICML version: 60%) lower agent success; SWE-bench Verified exists to remove under-specified tasks | Generated SWE-bench-style sets | https://arxiv.org/html/2503.07701v1 | Medium-high that spec quality matters; no study of "locked decisions" per se |
| 17 | Agent code quality vs human | Agent PRs: code smells dominate new issues (89.3% of introduced issues over 302.6k commits); ~63% more smells than human (secondhand cite); agent code gets less maintenance, humans do ~83% of later edits; matched Terraform pairs show similar smell rates; test smells not worse in mixed PRs | AIDev / GitHub in the wild | https://arxiv.org/html/2603.28592v2 ; https://arxiv.org/abs/2601.20109 ; https://arxiv.org/html/2605.06464v1 ; https://arxiv.org/abs/2610.34613 ; https://arxiv.org/html/2601.21194v1 | Medium: observational, confounded. No primary duplication study found |
| 18 | Cheap builder + strong reviewer (tier mixing) | No direct controlled study found | - | - | Gap |
| 19 | LLM judge biases | Code judges: longer/random variable names inflate scores, effect grows with length; dummy-function padding inconsistent. Position bias <= 0.04 for five recent models (synthetic pairs); length effects vary by judge family; position bias varies more by judge/task than prompt length | Code judges; general pairwise | https://arxiv.org/pdf/2505.16222 ; https://arxiv.org/pdf/2604.23178 ; https://aclanthology.org/2025.ijcnlp-long.18.pdf ; https://arxiv.org/html/2604.16790v1 | Medium |

## What the evidence actually supports

1. Strongest: tests/execution signals beat model opinion. Selection by execution plus a hybrid verifier gives the largest measured gains, but at N-times cost and well below oracle.
2. Strong negative: more prose context (AGENTS.md style, LLM-generated) does not raise correctness and costs 20%+ more. Shorter and human-written is the safe direction.
3. Test quality is the weak link. Agent tests are often vacuous (low mutation score) or encode actual behaviour; misaligned self-written tests can lower fix rates. A test-first step helps only if tests are validated (fail before, pass after, kill mutants).
4. Self-review is the least independent check. Separate review helps in principle; a second reviewer adds little unless diverse.
5. Gaps (no measured effect found): planning ablation, debate, tier mixing, locked decisions, maintainability duplication. Any claim here in the pipeline is untested.

## Ranked shortlist: 6 A/B tests for spec -> build -> review

Run each as one variable flipped, same 3 specs, same model tier, otherwise identical.

1. **Test validation gate before build.** Variable: require builder's tests to fail on the base commit, pass after, and have a mutation score >= threshold (e.g. run mutmut/Stryker on touched files) vs. no gate. Metric: mutation score of final tests; defects the blind judge or hidden acceptance tests find. Why first: evidence #3/#4 is the most consistent.
2. **Context-file diet.** Variable: spec context = locked decisions + file plan only (human-written, under ~1 page) vs. current full doctrine/rules bundle. Metric: hidden acceptance pass rate, tokens/cost, tool-call count. Evidence #12 predicts equal correctness at lower cost.
3. **Reviewer independence.** Variable: reviewer = fresh context, different model family or tier from builder vs. same model self-review. Metric: seeded-defect catch rate (inject 3-5 known bugs per spec) and false-positive count. Evidence #9.
4. **Best-of-2 (or 3) by executable check.** Variable: n=1 vs n=3 builds, pick by test pass then fewest lines changed. Metric: acceptance pass rate per dollar. Evidence #6/#7; expect gain smaller than headline and cost ~3x, so read pass-per-$ not pass.
5. **Locked decisions on/off.** Variable: spec with locked design decisions and explicit acceptance criteria vs. same spec with those sections stripped to an issue-style paragraph. Metric: acceptance pass, blind-judge preference, rework rounds. Evidence #16 is indirect; this is a real gap and the one most specific to your pipeline.
6. **Cheap builder + strong reviewer vs strong both.** Variable: builder tier only. Metric: acceptance pass and cost; also review findings per round. Untested in literature, so cheap to learn from.

Deferred: plan-before-code (no signal that it matters beyond spec), debate (no evidence), lesson memory (contamination-prone, single-paper evidence; test only after the above).

## Fair blind pairwise judge for code diffs

Controls:
- **Position:** run every pair in both orders (A/B and B/A); count a win only if the verdict survives the swap, else score a tie. Recent models show small position bias (<=0.04) on synthetic pairs but it varies by judge and task, so swapping is cheap insurance.
- **Length/verbosity:** report diff size and comment lines per arm; instruct judge that length is not quality; normalise by checking the judge's win rate against a length-matched tie set (pad one arm with neutral content and confirm the judge calls a tie). Code judges are demonstrably swayed by long identifiers, so run a rename pass (normalise identifiers/comments formatting with the project's formatter) before judging.
- **Identity leakage:** strip commit messages, branch names, agent signatures, tool-specific boilerplate, and PR prose. Randomise arm labels per pair.
- **Self-preference:** judge with a model family different from both builders, or use two judges from different families and require agreement.
- **Grounding:** judge against a rubric of concrete criteria (correctness vs spec, duplication, naming, test strength, scope creep) and give it the spec and test output. Use pairwise forced-choice plus per-criterion verdicts, not a 1-10 score (scoring bias is documented: https://arxiv.org/html/2506.22316v1). Where possible let objective metrics (hidden tests, mutation score, lint/smell counts, duplication %) outrank the judge.
- **Hacks to avoid:** do not show the judge the other judge's output; do not let the judge see which arm is "new".

Repetitions for 3 specs:
- 3 specs gives 3 pairs per comparison, which is too few for any statistics. Raise the count by judging each pair with both orders x 3 independent judge samples (temperature > 0) x 2 judge families = 12 verdicts per spec; take majority per spec. This reduces judge noise, not build noise.
- Build noise dominates. Run each arm 3 times per spec (9 builds per arm). Then you get 9 paired comparisons per A/B, enough to see only large effects (roughly a 7/9 or better win rate, sign-test p ~ 0.09; 8/9 gives p ~ 0.04). Do not claim small deltas.
- Prefer objective metrics as the primary readout (acceptance pass, mutation score, seeded-defect catch) and use the judge as a tiebreaker/secondary readout.
- Record judge-flip rate on swapped order; if it exceeds ~20%, the judge is too noisy for that rubric item and should be dropped.

## Caveats
Snippet-level verification only; several 2026 arXiv items had unusual IDs or listing-only sources (rows 14, TDFlow numbers). Verify before quoting externally. SWE-bench Verified contamination is documented (https://arxiv.org/html/2512.10218v2), so absolute numbers overstate real-world performance. Leaderboard (SWE-bench Pro https://arxiv.org/pdf/2509.16941, Terminal-Bench, Aider polyglot) method comparisons were not pulled in this pass.
