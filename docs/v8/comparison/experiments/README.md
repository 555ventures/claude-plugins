# v8 treatment experiments (2026-11-04)

Harness: same host app, same three specs (04 rate limiting, 05 persistence, 06 API keys),
same seats, each arm run twice from the same base by an Opus session with no user. Judge:
fresh Fable, blind, per spec, both reading orders, forced choice per criterion; a choice
counts only if both orders agree. Objective: mutation score (`mutate.js`, 4 feature files,
seed 42) and test count. Research behind the candidates: `../../research/`.

| Treatment | Branch | Criterion wins ctrl : treat (unstable) | Overall per spec ctrl : treat | Mutation score, 2 runs | Verdict |
|---|---|---|---|---|---|
| A red-first gate (red-check on every green gate; vacuous test → REPAIR) | `v8-redfirst` 57f8bc96 | 14 : 9 (7) | 3 : 2 (1) | 91.9, 91.1 vs ctrl 95.2, 92.3 | drop: fired once in 6 runs, a false positive on an edited existing test; no gain |
| B builder brief + Anthropic "real check" and "follow-ups, don't fix" paragraphs | `v8-briefB` 178cfb36 | 18 : 11 (1) | 3 : 3 | 93.3, 89.9 | drop: no gain, +100 words |
| C reviewer self-reflection pass (seeded defects, 18 dispatches) | prompt only | control caught 45/45, reflect 42/45, 0 false in both | — | — | drop; fixtures too easy to separate arms |
| D Sonnet builder at effort medium instead of high | config only | 21 : 4 (5) | 4 : 1 (1) | 92.0, 93.0 | keep high: judge prefers high on every spec; wall-clock similar |

Noise notes: a local process (`moshi-hook serve`) probes every new port and makes the
request-logging test fail about 1 in 5 suite runs; flake repairs are excluded. All judge
confidences were 1–2 except one 3; runtime code was near-identical across arms, differences
were test hygiene. Two runs per arm detect only large effects.
