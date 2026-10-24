# spec plugin evals

This suite answers one question the test suite cannot: does a fresh Claude session pick this
plugin up and actually run its scripts? `claude plugin eval` runs each case with the plugin
loaded and again with no plugin (the baseline), then reports the difference.

Owner: specs/20261024/03-plugin-evals-with-deterministic-graders.md. The suite never runs in
the gate — every run is a paid Claude session. `tests/evals-suite.test.js` pins its shape for
free.

## Cases

| Case | Tag | Asks, in plain words | Passes when |
|------|-----|----------------------|-------------|
| `status` | cheap | where the work stands | `/spec:status` fires and `spec-status` runs |
| `queue` | cheap | what is queued next | `/spec:queue` fires and `spec-queue` runs |
| `doctor` | cheap | whether the grounding drifted | `/spec:doctor` fires and `spec-paths contract-hash` runs |
| `run` | heavy | `/spec:run` on a one-function spec | the build driver runs before the review driver, and review closes |

Every grader is deterministic (`tool_used`, `tool_order`); none calls a judge model. Each case's
`fixture.sh` sources `host.sh` to write a grounded host into the empty workspace, because an
eval run loads no project config of its own.

## Run it

From the repo root:

```
claude plugin eval ./spec --scaffold --trust-plugin --no-publish --tag cheap --allow-tools Bash
claude plugin eval ./spec --scaffold --trust-plugin --no-publish --runs 1 --tag heavy --allow-tools Bash Edit Write
```

`--scaffold` runs the fixtures; `--allow-tools` is required because a run grants only
read-only tools by default, and every case here needs Bash. Add `--max-cost-usd <n>` for a hard
ceiling.

## Cost per run

- **Cheap suite — measured cost per run: $2.89**, 8 minutes (3 cases × 3 runs × 2 arms = 18
  sessions, about $0.13–0.23 each). That first run scored WITH 1.00 on every case, W/OUT 0.11
  mean, Δ 0.89.
- **Heavy case — not yet measured.** It is one full `/spec:run` (build, then review) with up to
  150 turns; expect several dollars. Run it with `--max-cost-usd` set, and record the figure here.

Each run writes its results under `spec/evals/results/`, which git ignores.

## Reading the result

- **WITH** is the mean score with the plugin loaded; it is what `--threshold` gates on.
- **W/OUT** is the no-plugin baseline. The `Skill` graders are `arm: with-only`, so they show
  as a plugin-fired indicator and do not count in either score.
- **Δ** is WITH minus W/OUT. A Δ near zero with the `Skill` indicator failing means the
  command's description did not trigger on the prompt's phrasing — fix the description, re-run.
- In `--json` output, `aggregates.overallScore` and `aggregates.meanDelta` summarise the suite;
  `cases[].arms.with[].error` names any run that timed out or hit `max_turns`.
