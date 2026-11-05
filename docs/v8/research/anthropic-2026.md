# Anthropic 2026 guidance: autonomous coding pipelines (researched 2026-11-04)

Tags: [official-measured] = Anthropic states a measured result; [official-recommended] = official doc recommends, no number; [blog/anecdote] = Anthropic engineering post narrative.
Base URLs: P = https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/ ; C = https://code.claude.com/docs/en/

## Ranked mechanisms

**1. Fresh-context verifier vs self-critique** [official-recommended + blog]
- Quote: "Separate, fresh-context verifier subagents tend to outperform self-critique." (P/prompting-claude-fable-5, Recommended scaffolding changes). Harness post: agents "reliably skew positive when grading their own work"; "tuning a standalone evaluator to be skeptical turns out to be far more tractable" (https://www.anthropic.com/engineering/harness-design-long-running-apps). Claude Code: /code-review "reviews the diff in a fresh subagent that never saw your conversation. It isn't swayed by the reasoning that produced the code." (C/best-practices)
- Model: Fable 5 (doc); harness post on Opus 4.5. Changes: quality.
- Plug-in: your Opus reviewer already is this. Keep it fresh-context, read-only (`tools: Read, Grep, Glob`, enforced by harness), and given the spec path.

**2. Review prompt: "against SPEC, report gaps affecting correctness, skip style"** [official-recommended]
- Quote: "A reviewer that's asked to find problems will always find *something*. If you fix every finding, you end up with extra abstraction layers and tests for cases that can't happen." Prompt: "review the diff against SPEC.md, check every requirement is implemented and the listed edge cases have tests, report gaps that affect correctness and skip style" (C/best-practices).
- Changes: quality (fewer false-positive fix loops), cost. Plug-in: reviewer brief = locked decisions + ACs, severity-gated; no free-form "find bugs".

**3. Reviewer evaluator needs tuning against your own divergences** [blog/anecdote]
- "Out of the box, Claude was a poor QA agent. It spotted real issues, then talked itself into approving." Loop: read evaluator logs, find where its judgment diverged from the author's, edit QA prompt; "several rounds" (harness post). Evaluator "not a fixed yes-or-no decision. It's worth the cost when a task sits beyond what the model does reliably alone."
- Cost data (Opus 4.5): solo 20 min/$9 vs full harness 6 h/$200 (core feature worked only in harness); QA rounds ~7-10 min, $3-4 each.
- Plug-in: keep a ledger of review verdicts vs later defects; tune reviewer prompt from divergences. Per the post, test removing each component one at a time to see which is load-bearing (supports trimming).

**4. Contract before build: agree "done" with testable criteria** [blog/anecdote]
- "Before each sprint, generator and evaluator negotiated a contract agreeing on what 'done' looked like"; one sprint had 27 criteria. Planner stays "high-level on deliverables and avoid granular technical detail, so early spec errors wouldn't cascade." Later models (Opus 4.5+) let them drop the sprint construct and run the evaluator once at the end.
- Plug-in: Fable's locked decisions + ACs is this contract. Caution from the post: over-granular planner specs propagate errors; lock decisions and ACs, not implementation steps.

**5. Give the builder a verification method AND an interval** [official-recommended]
- Quote: "Establish a method for checking your own work at an interval of [X] as you build. Run this every [X interval], verifying your work with subagents against the specification." (P/prompting-claude-fable-5). General: "Before you finish, verify your answer against [test criteria]. This catches errors reliably, especially for coding" (P/claude-prompting-best-practices). Exception: Opus 5 verifies unprompted; explicit verification instructions cause over-verification, "remove these instructions rather than rewriting them" (applies to Opus reviewer: do not stack verification prose on it).
- Sonnet 5.5 specific [official-measured]: at low effort it "sometimes reports a change as done without running a check"; the quoted paragraph ("run a real check that exercises the change before reporting it done... A syntax-only check, or a check command that failed to start, does not count") "makes skipped or superficial checks rare, with no measurable change in task quality and only a slightly higher cost" (P/prompting-claude-sonnet-5-5).
- Plug-in: builder brief includes that paragraph plus "run the AC test command every N edits". Deterministic gate still final.

**6. Ground progress claims against tool results** [official-measured]
- "Before reporting progress, audit each claim against a tool result from this session..." "In Anthropic's testing, this nearly eliminated fabricated status reports even on tasks designed to elicit them." (P/prompting-claude-fable-5). Model: Fable 5.
- Plug-in: builder report must cite command + output per AC; gate reads exit codes, not prose. Also C/best-practices: "ask Claude for evidence: the command it ran and its output."

**7. Effort per seat** [official-recommended, with measured fragments]
- Opus 5.5: default `medium`; "at medium matches or exceeds Claude Opus 5 at high on coding... on several coding evaluations low comes close to it at much lower cost" [official-measured]; "Reserve xhigh and max for work where you've measured a quality gain." Reviewer at low Opus 5.5 is on-label.
- Sonnet 5.5: "For agentic coding and multistep tool use, start at medium for well-specified tasks and move to high for harder or longer ones." At low/medium on long tasks "more likely to stop and check in"; at xhigh/max it self-starts review rounds. Quoted stop-prompt at max "cut session cost by about a third, with no change in quality" [official-measured]: "Don't start extra rounds of review or hardening on your own, and don't launch reviewer sub-agents unless the user asked for a review."
- Fable 5.1: default `high`; "At medium, results roughly match Claude Fable 5 at lower cost"; at `low` "often competitive with Claude Opus and Claude Sonnet models on cost per task while scoring higher". Planning seat: high (xhigh only if measured).
- Haiku 5.5 at low "more likely to skip a search, stop early, or skip a check". Use `medium`+ for anything agentic.
- Haiku for simple subagents (C/best-practices). Sweep effort on your own evals; names differ per model (all P pages, https://platform.claude.com/docs/en/build-with-claude/effort).
- Plug-in: planner Fable high; builder Sonnet 5.5 medium (high for hard specs) + scope paragraph; reviewer Opus 5.5 low/medium with the review prompt of #2. Changing top-level effort invalidates cache; use per-message effort (beta).

**8. Autonomous-run stop-prevention** [official-recommended; one measured]
- Fable 5.1 "Finish the whole task": "The opening sentence, which tells the model the user isn't watching, carries much of the effect": "You are operating autonomously. The user is not watching in real time... asking 'Want me to…?'... will block the work... Before ending your turn, check your last paragraph. If it is a plan... or a promise about work you have not done, do that work now with tool calls." (P/prompting-claude-fable-5-1). Sonnet 5.5: "Keep working until everything the user asked for is done, and only stop to ask when you can't go on without the user or before a risky step." (P/prompting-claude-sonnet-5-5).
- Harness-side: Opus 5.5 "Treat a text-only end of turn as a report rather than as proof the task is done"; checklist the model updates; re-prompt naming open items; "stop after two or three automatic continuations". Enforcement: Stop hook exit 2 blocks stop (cap 8 consecutive blocks, `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`); `/goal <condition>` has "a separate model" check the condition "after every turn" (C/best-practices; C/goal; C/hooks#stop).
- Plug-in: builder runs under a Stop hook that executes the AC test command and exits 2 with output on stderr; this is the deterministic gate moved inside the loop, so failures never reach the reviewer. Cap continuations at 2-3.

**9. Keep scope tight: "report extras as follow-ups"** [official-measured]
- Fable 5.1: with the quoted instruction, "unrequested additions and committed test code drop substantially with no measurable change in task success" ("don't fix, optimize or extend it in this change... report it as a follow-up in your summary... one focused test per stated behavior"). Sonnet 5.5 second paragraph: "Don't add features, tests, files, docs or refactors that weren't asked for." Fable 5: "Skills developed for prior models are often too prescriptive... can degrade output quality."
- Plug-in: add to builder brief; also gives reviewer less diff noise. Review old prompts/skills for retire-ability after each model bump.

**10. Fresh session per build + state in files, not compaction** [official-recommended]
- "When a context window is cleared, consider starting with a brand new context window rather than using compaction. Claude's latest models are extremely effective at discovering state from the local filesystem." Be prescriptive: "Review progress.txt, tests.json, and the git logs"; run a basic integration test first; tests in JSON ("model is less likely to inappropriately change or overwrite JSON"); "It is unacceptable to remove or edit tests"; one feature at a time (P/claude-prompting-best-practices; https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents). Claude Code: "Once SPEC.md exists, start a fresh session to build from it, so the build begins with a clean context and a written definition of done"; after two failed corrections, `/clear` and rewrite the prompt (C/best-practices).
- Harness post: resets were essential on Sonnet 4.5 (context anxiety) and dropped for Opus 4.5. Avoid showing token countdowns (Fable 5: triggers handoff offers; Sonnet 5.5: misread as injection).
- If compacting client-side on Fable 5.1, use the quoted six-item preserve list (P/prompting-claude-fable-5-1).
- Plug-in: one Sonnet builder = one fresh worktree session, input = spec file; the "do not edit/delete tests" rule in brief; gate diffs test files against the spec's test list.

**11. Memory notes of lessons across runs** [official-recommended]
- "Claude Fable 5 performs particularly well when it can record lessons from previous runs and reference them." Recipe: "Store one lesson per file with a one-line summary at the top. Record corrections and confirmed approaches alike, including why they mattered. Don't save what the repo or chat history already records; update an existing note rather than creating a duplicate; delete notes that turn out to be wrong." Bootstrap: have it review past sessions with subagents (P/prompting-claude-fable-5). No measured number given.
- Plug-in: lessons dir read by planner and reviewer only (Fable-measured); do not assume the same gain for Sonnet builder. Keep CLAUDE.md short: "every line takes a little of Claude's attention on every task" (C/best-practices).

**12. Explain the why; brief subagents with objective/format/boundaries; batch tool calls** [mixed]
- Why: "Claude Fable 5 tends to perform better when the prompt states the intent behind a request" (P/prompting-claude-fable-5) [official-recommended]. Subagent brief: "Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries" (https://www.anthropic.com/engineering/multi-agent-research-system) [blog]; same post: token usage alone "explains 80% of the variance"; parallel subagents and parallel tools "cut research time by up to 90%" (research domain, not coding); multi-agent used ~15x chat tokens. Opus 5.5 given elapsed-time budget: teams "finish considerably sooner" at comparable quality [official-measured, research tasks].
- Batching: Fable 5.1 in coding loops may issue independent calls one per turn; nudge "First privately list what you need next; then request every item that doesn't depend on another's result in this one response", appended each turn as a turn-scoped system message (beta). Lead should keep working while subagents run: "lowers average time to completion at similar quality, token usage, and cost" [official-measured, coding].
- Plug-in: spec "why" lines on each locked decision; if the builder runs via raw API loop (not Claude Code), add the batching nudge.

## Also relevant (not ranked)
- Plugin evals as regression harness: `claude plugin eval` runs each case 3x by default, graders (regex, tool_used, tool_order, file_exists, llm, baseline), pass = mean score >= `--threshold` (default 1.0), no-plugin baseline gives delta, exit 1 for CI (C/plugin-evals) [official-recommended]. Use it for the pipeline's own prompts after each model bump. Skills guide: build >=3 evals before writing the skill, "Tested with Haiku, Sonnet, and Opus"; SKILL.md body under 500 lines; one-level references; "Run validator, fix errors, repeat... greatly improves output quality" (https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices). Multi-agent post: ~20 queries suffice to start; one LLM judge call 0.0-1.0 was most consistent.
- Worktrees: `claude -w name`; `.worktreeinclude` copies gitignored files; deps not installed in a fresh worktree, put install in CLAUDE.md; `claude -p --worktree` runs need manual cleanup (C/best-practices).
- Sonnet 5.5: "For the hardest long-horizon work, an Opus model is the better choice" (P/prompting-claude-sonnet-5-5): escalate hard specs to Opus builder.
- Subagent cost: "a fresh subagent first has to gather context... can end up slower"; delegating the same task "doesn't make the answer any better. A fresh reviewer does help" (C/best-practices). Supports: use subagents for review/parallel, not for splitting a single build.
- Structured-output findings: Sonnet 5.5 + structured outputs on reasoning tasks may skip thinking; add "Think the problem through before you answer." (brings accuracy near xhigh at high effort) and treat `stop_reason: max_tokens` as failed [official-measured]. For reviewer findings JSON: use adaptive thinking, not `between_tools`.

## Caveats
- Fable 5.1 and 5.5-generation pages were fetched via summarizer; quotes spot-checked against saved page text for #5, 6, 7, 8, 9, 11. Harness-design and multi-agent post quotes come from the fetch summarizer, not raw text; verify before citing externally. Several measured claims are Anthropic-internal with no public methodology.
- /goal page and hooks page were not fetched directly; claims come from the best-practices page.
