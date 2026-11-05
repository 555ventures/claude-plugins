# v7 vs v8 blind comparison (2026-11-04)

Same host app, same three specs (identical Decisions, File Plans, ACs; rendered in each
plugin's format), same seats (Sonnet builder high, Opus reviewer low, Opus orchestrator),
each plugin run serially by an Opus session with no user. Per-spec diffs of what each
plugin merged to main (src/, tests/, bin/, package.json) were labelled A/B at random
(`mapping.json`) and scored by a fresh Fable judge who never saw the mapping
(`JUDGEMENT.md`).

| | v7 | v8 |
|---|---|---|
| wall-clock, 3 specs serial | 10 min 11 s | 7 min 20 s |
| tests on main after | 16 (unchanged: close step expired every new feature test) | 44 |
| src LOC / tests LOC | 336 / 208 | 300 / 587 |
| judge overall 04 / 05 / 06 | 5 / 4 / 4 | 9 / 9 / 9 |
| judge verdicts | — | v8 on all three |

Judge's cross-pair finding: the implementations converge almost line for line because
the locked Decisions steered both; the entire gap is the test leg and dead scaffolding
v7 left behind after test expiry.
