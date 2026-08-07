---
date: 2026-08-07
status: done
open_markers: 0
risk: T3                 # spec-status.js is a listed T3 trigger (sole "what's next" derivation)
area: status
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
---

# Observation slims to a red alarm; the status render bottom-anchors Next

## Goal

The post-review observation window (specs/20260805/03) shipped two things fused together: a
red alarm (CI broke on landed code → dashboard goes red with a paste-ready `/spec:escape`)
and a green-certification ledger (every done spec is "unobserved" until a containing run is
recorded). The owner has ruled the certification half is pure noise — merge-back never
pushes, so historical specs can never qualify and sit "⏳ unobserved" forever. This spec
keeps the alarm and deletes the certification: observation becomes **silent unless red**.
Independently, the `--pretty` dashboard prints its actionable sections first, so on large
hosts the 🎯 Next block scrolls off the top of the terminal; the render inverts to
**bottom-anchored** — detail up top, 🎯 Next and the verdict headline as the last lines on
screen. Done means: a healthy host shows zero observation output anywhere, a red run on
landed spec code still tops Next as one escape entry, and Next is visible without scrolling.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `--pretty` section order inverts to: 🗺️ Roadmap → 📡 red-alarm lines (only when red) → ⚠️ Anomalies → 🎯 Next → headline verdict line **last** (same one-line format it has today, minus the ⏳ segment). `--next` mode and `--json` shapes are unchanged by this decision. The "anomalies fold onto their Next line as ⚠️ tags" behavior is unchanged; the standalone-anomaly section just moves above Next. The TTY `\x1Bc` redraw stays. | A terminal shows the TAIL of output; everything actionable must be the last thing printed (owner directive 2026-08-07 — "I need to scroll up to see what's Next"). Rejected: headline-first with Next second-to-last — the headline is one glance-parseable line, so it wins the very bottom slot. |
| D2 | The derived observation sub-state loses `pending`: for a done spec, latest qualifying observe row `ci:"red"` → `observation:"red"`; **any other case** (no row at all, latest green, latest historical `none`) → `observation:"ok"`; non-done specs stay `"n/a"`. Nothing renders for `"ok"`: no headline ⏳ count, no per-spec `done ⏳ unobserved` lines, no 📡 section unless at least one spec is red. `lib/observation.js` (`readLedgerRows`/`qualifyingObservation`, runAt-max, red-wins-tie) is unchanged — only the mapping and render die. | The certification half of spec 03 is retired by owner decision: unpushed closes can never qualify, so `pending` is a permanent nag with no exit, and a state nobody acts on must not render (three explicit "I don't want to see it" rulings, 2026-08-07). The D2 algorithm survives because red-vs-cleared still needs latest-row semantics. |
| D3 | `observe-ci.js` is rewritten to one branch-level check per run: resolve the default branch once (`git symbolic-ref refs/remotes/origin/HEAD`, else current branch; per-spec `build_base` is no longer consulted), query `ci-query.js` once. Outcomes: unavailable (structural OR transient) or run not completed → print nothing, append nothing, exit 0 — transient failures no longer print ⚠️ (retry is free at the next invocation; a nag line on every offline run is the exact noise class being retired). Completed **red** → attribute: among done specs whose close commit (`git log -1 --format=%H -- {spec path}`) is an ancestor of the run's sha (`git merge-base --is-ancestor`; unknown sha → one `git fetch origin {branch}`, then re-check), append ONE `ci:"red"` row for the spec with the latest close-commit timestamp only (timestamp tie — e.g. two specs closed in one commit — breaks by lexicographically **last** spec path, the highest `##-` in the newest date dir, i.e. the most recently numbered work); one red run = one alarm = one escape entry, never one per done spec; no done spec's close contained → append nothing (redness not caused by pipeline-landed code is CI's own surface, outside this mechanism's charter). Completed **red** while a spec is ALREADY red → never attribute a second spec: if the run's sha differs from the red spec's recorded row, append a fresh `ci:"red"` row for that SAME spec (evidence refresh); at most one spec holds the alarm at any time (refuter B finding 4 — a persistently broken branch under continued landings must not accumulate one alarm per newest close). Completed **green** → for every done spec currently `observation:"red"` whose close commit is an ancestor of the green run's sha (`git merge-base --is-ancestor`, same plumbing as attribution), append a clearing `ci:"green"` row; a green run NOT containing the red spec's close (a re-triggered run of an older commit) clears nothing (refuter B finding 1 — run recency is completion order, not commit order; an out-of-order green must never silence a live break); otherwise append nothing. Idempotence keeps spec 03's rule: never append a row with the same `sha`+`ci` as the spec's current latest qualifying row. `ci:"none"` rows are never written again (historical ones stay in the ledger, inert under D2). Exit codes stay 0/2/4 with the worktree refusal (exit 4) verbatim. | Ancestry survives demoted from green-certifier to red-attributor — its cheap, load-bearing role (never alarm a spec whose code isn't in the failing run); the latest-close pick follows the owner's standing "one next action" directive, and `/spec:escape`'s D8 no-escape-if-unimplicated stop already adjudicates a wrong guess in-session. Clearing keeps ancestry because `gh run list --limit 1` orders by run recency, not commit order — a re-run of an old commit is "latest" the moment it finishes. |
| D4 | Observe rows keep the spec 03 schema (`{ts, stage:"observe", spec, branch, ci, sha, url, runAt}`) and doctor check 12 keeps `observe` in its stage enum with `none` still a valid `ci` value (the ledger is append-only; historical rows must keep parsing). `spec/commands/doctor.md` needs **no edit**: check 12's observe text (stage enum + required-field exemption + archive awareness) contains no pending/qualifying language to remove — verified at plan time (refuter A finding, fixed by dropping the file from the File Plan). | Ledger back-compat is free — the noise disappears purely by derivation change (D2), no migration, no archived-row rewrite; a schema change here would buy nothing and cost every host's doctor a transition case. |
| D5 | Doctrine sweep, minimal: `status.md` keeps the "run observe-ci first" step but rewrites the step's whole description paragraph — both the mechanism sentence (it currently narrates the retired per-spec pending-or-red candidate loop, status.md:24-27; refuter B finding 3) and the output expectation ("normally prints nothing; red prints the alarm rows"); exit-4 STOP handling unchanged; `review.md` Phase 4 keeps its single post-merge-back observe invocation (wording updated to the slim contract, placement unchanged); `escape.md`'s D8 red-observation entry path survives verbatim except the clearing sentence, which now cites the D3 green-clearing row; `docs/canonical/autopilot.md` is untouched (the oracle's `/spec:escape` entry contract is unchanged). `spec-status.js`'s header contract comment (consumer list + observation paragraph) is updated in the same edit per spec 03 D6. | Every invocation point and the escape flow survive — this spec deletes a state, not the mechanism; the header comment is that file's authoritative contract doc and silently drifting it is the exact class spec 03 D6 retired. |
| D6 | `spec/doctrine/scaffold-ledger.md`'s "Post-verdict observation window" row is rewritten in place: mechanism = red-alarm-only (branch-level check, red attribution by ancestry, green rows only as red-clearing), justification gains the 2026-08-07 owner retirement of the certification half (pending was permanently unsatisfiable under never-pushed closes — the retire condition's spirit exercised early by direct owner ruling), promote/retire conditions keep the existing force-push promote clause and the two-quarters-no-acted-escape retire clause. | The ledger row is the guard's registration; a mechanism that shrank without its row updating would flunk the repo's own review checks (hard finding: mechanism/ledger drift). |
| D7 | `spec/.claude-plugin/plugin.json` bumps to 6.43.0; description line records the slim ("observation = red alarm only; status render bottom-anchored"). | Version bump discipline — every behavior change bumps the owning plugin's semver; description is the changelog surface. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-status.js | MODIFY | scripts | D1 render inversion, D2 slim mapping + no-ok-render, D5 header contract update |
| spec/scripts/observe-ci.js | MODIFY | scripts | D3 rewrite: one branch check, red attribution, green clearing, silent otherwise; header/exit codes per Worker Rules |
| spec/commands/status.md | MODIFY | doctrine | D5: observe step output expectation, silent-normally |
| spec/commands/review.md | MODIFY | doctrine | D5: Phase 4 observe step wording, placement unchanged |
| spec/commands/escape.md | MODIFY | doctrine | D5: D8 clearing sentence cites green-clearing rows |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D6: observation row rewritten in place |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7: bump 6.43.0 + description |
| tests/status/observe-ci.test.js | MODIFY | tests | AC-20260807-01-3, AC-20260807-01-4, AC-20260807-01-5, AC-20260807-01-6, AC-20260807-01-8, AC-20260807-01-9, AC-20260807-01-12 |
| tests/status/done-unobserved.test.js | DELETE | tests | superseded by red-alarm.test.js (pending render pins die with the state) |
| tests/status/red-alarm.test.js | CREATE | tests | AC-20260807-01-2, AC-20260807-01-7, AC-20260807-01-10 |
| tests/spec-status.test.js | MODIFY | tests | AC-20260807-01-1 (order pins), AC-20260807-01-11 retag on the absent-ledger pin |

## Contracts

`--json` specs[] observation field (documented in spec-status.js header):

```
observation: "n/a" | "ok" | "red"     // "pending" is never emitted again
```

Observe ledger row (unchanged shape, slimmed writers):

```
{"ts","stage":"observe","spec","branch","ci":"red"|"green","sha","url","runAt"}
// ci:"none" is read-tolerated (historical) and never written
```

`--pretty` section order (D1): `🗺️ Roadmap` → `📡` red lines (conditional) → anomalies
section → `🎯 Next` → headline line last. `--next` output: unchanged.

## Behavior

- Healthy host, any number of done specs, no ledger or all-green rows: `observe-ci` prints
  nothing; `spec-status --pretty` contains no `📡`, no `⏳`, no `unobserved` anywhere; last
  two blocks on screen are 🎯 Next then the headline.
- CI goes red on the default branch on a run containing done-spec code: next `/spec:status`
  or `/spec:review` invocation appends one red row for the latest-closing implicated spec;
  the dashboard's final line starts 🔴, a `📡 🔴 done-but-red {spec} — {branch}@{sha}
  ({url})` line renders above the anomalies section, and `/spec:escape @{spec}` tops 🎯 Next
  as the full oracle-shaped entry (unchanged shape).
- A later green run on that branch: next invocation appends a green clearing row per red
  spec; the dashboard returns to fully silent observation.
- `gh` missing, offline, no remote, or run in progress: total silence, no ledger writes.

## Acceptance Criteria

- **AC-20260807-01-1**: WHEN `--pretty` renders on a host with briefs, open specs, and ≥1
  standalone anomaly THE SYSTEM SHALL print sections in the order Roadmap → anomalies →
  🎯 Next → headline, with the headline the final line of output (e.g. last two lines are
  `/spec:build @specs/.../02-x.md` inside 🎯 Next, then `🟠 …scope… · ⚠️ 1 anomaly`) → order
  test in tests/spec-status.test.js
- **AC-20260807-01-2**: WHEN a done spec has zero qualifying observe rows THE SYSTEM SHALL
  report `observation:"ok"` in `--json` and render no `📡`/`⏳`/`unobserved` text anywhere in
  `--pretty` (absent ledger → `grep -c "unobserved" output` = 0) → red-alarm.test.js
- **AC-20260807-01-3**: WHEN observe-ci sees a completed red run whose sha contains the close
  commits of two done specs THE SYSTEM SHALL append exactly one `ci:"red"` row, for the spec
  whose close commit has the latest commit timestamp (equal timestamps → the
  lexicographically last spec path wins: `specs/20260807/02-b.md` over
  `specs/20260805/03-a.md`) → observe-ci.test.js
- **AC-20260807-01-4**: WHEN observe-ci sees a completed red run whose sha contains no done
  spec's close commit THE SYSTEM SHALL append nothing and print nothing → observe-ci.test.js
- **AC-20260807-01-5**: WHEN observe-ci sees a completed green run whose sha contains the
  close commit of the currently-red done spec THE SYSTEM SHALL append one `ci:"green"` row
  for that spec and none for non-red specs; WHEN the green run's sha does NOT contain the
  red spec's close commit (re-run of an older commit) THE SYSTEM SHALL append nothing →
  observe-ci.test.js
- **AC-20260807-01-12**: WHEN observe-ci sees a NEW red run (different sha) while a spec is
  already red THE SYSTEM SHALL append a fresh `ci:"red"` row for that same spec and SHALL
  NOT attribute any other spec, even one with a later close commit contained in the run →
  observe-ci.test.js
- **AC-20260807-01-6**: WHEN ci-query reports unavailable (structural or transient) or a run
  not completed THE SYSTEM SHALL append nothing, print nothing, and exit 0 → observe-ci.test.js
- **AC-20260807-01-7**: WHEN the latest qualifying row for a done spec is red THE SYSTEM
  SHALL CONTINUE TO turn the headline glyph 🔴, render the red line with branch/sha/url, and
  top `--next` with the full oracle-shaped `/spec:escape` entry (`blockers:[]`,
  `parallel:false`, `parallel_reason:null`, note `CI red on {branch} @{sha} — {url}`) →
  red-alarm.test.js (entry shape also pinned by tests/autopilot/lane.test.js, untouched)
- **AC-20260807-01-8**: WHEN observe-ci runs with CWD inside `.claude/worktrees/...` THE
  SYSTEM SHALL CONTINUE TO exit 4, write nothing, and name the repo-root remedy →
  observe-ci.test.js (existing test retagged)
- **AC-20260807-01-9**: WHEN observe-ci observes the identical failing run twice (same
  sha+ci as the current latest qualifying row) THE SYSTEM SHALL CONTINUE TO append no
  duplicate row → observe-ci.test.js (existing test retagged)
- **AC-20260807-01-10**: WHEN qualifying rows disagree THE SYSTEM SHALL CONTINUE TO pick the
  greatest-`runAt` row with red winning ties (a newer green clears an older red regardless of
  line order) → red-alarm.test.js (assertion carried over from done-unobserved.test.js)
- **AC-20260807-01-11**: WHEN the ledger is absent THE SYSTEM SHALL CONTINUE TO render the
  identical baseline dashboard (glyph, roadmap, --next) it rendered before observation
  existed → the existing absent-ledger pin in tests/spec-status.test.js (the test carrying
  the AC-20260805-03-7 comment) retagged; identify it by name, not line number

## Assumptions (escalation triggers)

- A1: `ci-query.js`'s normalized output (`available`/`transient`/`status`/`conclusion`/
  `sha`/`url`/`runAt`) is sufficient for the branch-level check — executed against real `gh`
  when spec 02 spiked it (2026-08-05); no new dependency-adjudicated claims are introduced
  by this spec (all git plumbing used — `symbolic-ref`, `merge-base --is-ancestor`,
  `cat-file -e`, `log -1 --format=%H --`, `fetch`) is already executed by the landed
  observe-ci.js and pinned by its passing test suite, so no micro-spike is required —
  **if false:** blocked; re-run the ci-query spike before touching the contract.
- A2: no consumer reads `observation:"pending"` from `--json` — verified by sweep:
  `autopilot/daemon/lane.js` consumes `--next --json` only (entry shape unchanged), and no
  other repo surface greps the field — **if false:** STOP, ask the user before emitting a
  compatibility value.
- A3: `git merge-base --is-ancestor` on the clearing leg is sufficient to reject
  out-of-order green runs (re-runs of older commits); force-push remains the one accepted
  blind spot, named in the scaffold-ledger promote condition — **if false** (an ancestry-passing
  green observed clearing a still-broken spec): promote per that condition (second CI
  provider confirmation).
- A4: historical ledger rows (`ci:"none"`, greens, pendings-by-absence) parse and stay inert
  under the D2 mapping with no migration — **if false:** the derivation, not the ledger, is
  wrong; fix the mapping, never rewrite rows.

## Rationale

The owner ruled three times in one session (2026-08-07) that the unobserved state is noise:
it renders for specs that can never clear (merge-back never pushes; ancestry can never
validate a run for an unpushed close), and its only consumer-visible effect is a wall of ⏳
lines pushing 🎯 Next off-screen. The alarm half has a real incident behind it (the 2026-08
escape: days of red CI behind a green dashboard) and survives whole — same ledger stage,
same escape entry shape, same D8 derive path — so `/spec:escape`, doctor check 12, the
autopilot oracle, and lane.test.js all keep working untouched.

The one derived design point: a red run alarms **one** spec (latest close contained in the
run), announced as an auto-pick in-session. The alternative — one red row per contained
spec — recreates the noise wall as escape entries; `/spec:escape`'s existing
no-escape-if-unimplicated stop is the sanctioned corrector when the latest-close heuristic
fingers the wrong spec. Attribution-by-ancestry is retained precisely because it is the
cheap part of D4 that prevents false alarms on specs whose code never reached the failing
run.

Adversarial findings adjudicated (2 refuters, T3): accepted — clearing-leg ancestry (a
re-triggered green on an older commit is "latest" by run recency and must not silence a
live break), sticky single-alarm attribution (a persistent break under continued landings
must not accumulate one alarm per newest close), the stale status.md mechanism sentence,
the doctor.md no-op File Plan row (dropped — check 12 never carried pending language), and
the attribution tie-break. Rejected — "docs/canonical/status.md missed by the sweep": that
file is owned by this spec's Canonical Delta, applied by /spec:review on CLEAN, the
pipeline's normal route for canonical docs (the refuter's spec copy omitted the section).
Noted, no change — `origin/HEAD` is unset on init-then-push repos (refuter-executed); the
current-branch fallback already covers it. The transient-failure ⚠️ line is deleted
deliberately (D3): a nag on every offline invocation is the noise class this spec retires;
retry is free at the next invocation.

Review dispositions (2026-08-07, runId wf_783bfca9-dbf): the mechanical out-of-plan finding
(`docs/roadmap/00-overview.md`, `docs/roadmap/01-claims-registry.md`) was **waived** by the
user — pre-existing roadmap planning briefs from an earlier session today, untracked, not
build output; they ship on their own timeline and are excluded from this close commit.
Build deviation absorbed: the folded-anomaly summary line's trailing clause "tagged ⚠️
above" was changed to "below" — a plain directional-accuracy fix after D1 moved the
anomalies section above 🎯 Next; no AC or test pinned the word.

Render inversion is deliberately a pure reorder: no line format changes except deleting the
⏳ segment and unobserved lines, so existing content pins survive and only order pins move.
`--next` and `--json` are untouched surfaces — the autopilot boundary. Fragile spot to
watch: tests/spec-status.test.js has many regexes over full-output strings; the test worker
must move order-sensitive assertions, not weaken them (a weakened existing assertion is a
hard finding under Review Checks).

## Canonical Delta

docs/canonical/status.md replaces its observation paragraph with: "Observation is a red
alarm, not a certification (specs/20260807/01): `observe-ci.js` checks the default branch's
latest completed run once per invocation, attributes a red run to the latest-closing done
spec whose close commit it contains (ancestry), and appends one red row; a later green run
appends a clearing row. Everything else — unavailable CI, in-progress runs, healthy
branches — is silent and writes nothing. `spec-status.js` derives `observation:
n/a|ok|red`; only red renders (🔴 headline, one 📡 line, `/spec:escape` tops --next as the
oracle-shaped entry). The `--pretty` dashboard is bottom-anchored: Roadmap and detail
first, 🎯 Next and the headline verdict are the final lines."
