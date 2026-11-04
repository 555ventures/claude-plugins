# Reviewer experiment: CONTROL vs REFLECT (opus, effort low, 3 reps x 3 specs x 2 arms = 18 dispatches)

Scoring: CAUGHT = a finding (any severity) names the same file and the same behaviour as a seeded defect.
FALSE = blocking finding that matches no seeded defect and is not a real bug. Total = all findings, advisory included.
Clones 04/05/06 were checked after the run: git status was clean, so no reviewer modified them.

## Per dispatch

| arm | spec | rep | caught/5 | caught as blocking | false | total | wall-clock (s) |
|---|---|---|---|---|---|---|---|
| control | 04 | 1 | 5 | 4 | 0 | 6 | 35.8 |
| control | 04 | 2 | 5 | 4 | 0 | 5 | 22.4 |
| control | 04 | 3 | 5 | 4 | 0 | 5 | 23.2 |
| control | 05 | 1 | 5 | 2 | 0 | 5 | 24.9 |
| control | 05 | 2 | 5 | 2 | 0 | 4 | 24.4 |
| control | 05 | 3 | 5 | 2 | 0 | 5 | 20.9 |
| control | 06 | 1 | 5 | 5 | 0 | 6 | 24.6 |
| control | 06 | 2 | 5 | 4 | 0 | 5 | 20.8 |
| control | 06 | 3 | 5 | 5 | 0 | 5 | 21.4 |
| reflect | 04 | 1 | 5 | 4 | 0 | 5 | 24.4 |
| reflect | 04 | 2 | 5 | 4 | 0 | 5 | 30.8 |
| reflect | 04 | 3 | 5 | 4 | 0 | 5 | 31.2 |
| reflect | 05 | 1 | 4 | 2 | 0 | 4 | 26.0 |
| reflect | 05 | 2 | 4 | 2 | 0 | 4 | 26.2 |
| reflect | 05 | 3 | 4 | 2 | 0 | 4 | 25.4 |
| reflect | 06 | 1 | 5 | 5 | 0 | 5 | 15.9 |
| reflect | 06 | 2 | 5 | 5 | 0 | 5 | 19.7 |
| reflect | 06 | 3 | 5 | 4 | 0 | 5 | 19.1 |

Wall-clock is the agent's own duration_ms. REFLECT-06 ran about 6 min after the rest because of the 20-agent concurrency cap.

## Means

| arm | 04 caught | 05 caught | 06 caught | overall caught/5 | blocking-caught/5 | false | total findings | mean s |
|---|---|---|---|---|---|---|---|---|
| control | 5.00 | 5.00 | 5.00 | **5.00** (45/45) | 3.56 (32/45) | 0 | 5.11 | 24.3 |
| reflect | 5.00 | 4.00 | 5.00 | **4.67** (42/45) | 3.56 (32/45) | 0 | 4.67 | 24.3 |

## Each seeded defect: reps caught out of 3 (in brackets, reps where it was blocking)

| defect | description | control | reflect |
|---|---|---|---|
| 04-D1 | Retry-After sent in ms | 3 (3b) | 3 (3b) |
| 04-D2 | X-Forwarded-For used as bucket key | 3 (3b) | 3 (3b) |
| 04-D3 | eviction uses `>` instead of `>=` | 3 (3b) | 3 (3b) |
| 04-D4 | Math.round instead of ceil | 3 (3b) | 3 (3b) |
| 04-D5 | /health exempt by prefix match | 3 (0b, advisory) | 3 (0b, advisory) |
| 05-D1 | only the first write is atomic | 3 (3b) | 3 (3b) |
| 05-D2 | items not checked to be an array | 3 (0b) | 3 (0b) |
| 05-D3 | limit=0 returns everything | 3 (3b) | 3 (3b) |
| 05-D4 | `/^\d*$/` accepts empty values | 3 (0b) | 2 (0b), missed by rep2 |
| 05-D5 | createApp default todos.json, not data/todos.json | 3 (0b) | 1 (0b), missed by rep1 and rep3 |
| 06-D1 | GET /keys returns hash | 3 (3b) | 3 (3b) |
| 06-D2 | stored hash accepted as bearer | 3 (3b) | 3 (3b) |
| 06-D3 | bootstrap guard only checks that the header is present | 3 (3b) | 3 (3b) |
| 06-D4 | DELETE /keys/:id has no guard | 3 (3b) | 3 (3b) |
| 06-D5 | 64-bit key padded with zeros | 3 (2b) | 3 (2b) |

## Non-seeded findings (none blocking, so zero FALSE in both arms)
- control-04-rep1, advisory: "full suite fails, logger AC-1 test sees 3 lines". Not reproducible: a lone `node --test tests/` in 04 gives 25/25 pass. This was most likely interference from 15 reviewers running the suite in the same clones at the same time. It is spurious but advisory.
- control-06-rep1, advisory: no test covers POST/DELETE /keys with a bad key. This is a true test-coverage gap (it describes why D3 and D4 escape the suite), not a false bug.

## Reading
- The experiment hits a ceiling. CONTROL caught 45/45. Every reviewer found every blocking-class defect. The arms differ only on the advisory-class defects in 05: REFLECT lost 3 catches there, losing 05-D5 twice and 05-D4 once.
- REFLECT did not add catches. It made reviewers slightly more conservative ("drop any draft finding you cannot ground"), and at effort=low most REFLECT reviewers did not run the Pass-2 probes. About 4 of 9 report running probes: 04-rep2, 04-rep3, 05-rep3 and possibly 05-rep1. The others say they read the code only. Tool uses were 3 to 5 per agent in both arms.
- Severity calibration is identical between the arms (32/45 caught as blocking in each). Defects 04-D5, 05-D2, 05-D4, 05-D5 and sometimes 06-D5 get advisory severity. If the scoring counted only blocking findings, both arms would score 3.56/5.
- Cost and time were the same: about 24 s and about 35 to 40k tokens per dispatch in both arms.
- Caveat: these seeded defects can all be found by reading the diff. Every one sits on a line the diff touches, and most come with an obviously weakened test. A harder fixture is needed to tell the arms apart: defects that only show up when you execute the code, or that live in unchanged callers. The same goes for running at effort medium, so REFLECT actually probes.
