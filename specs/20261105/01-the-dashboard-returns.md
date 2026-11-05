---
date: 2026-11-05
status: hardened
area: status
depends_on: []
brief: n/a
architecture: false
---

# The dashboard returns: v7's `/spec:status` screen on v8's state

## Intent
- You asked: restore the v7 `/spec:status` screen — the roadmap with progress bars, the `qNN` rows, the lane markers, `--all`, `NN` — as UI/UX only, on v8's state model, with no v7 ledger and no change to how the queue or the engine behave.
- I will build:
  - `scripts/status.js` renders the v7 four-block screen byte-for-byte in shape: collapsed roadmap ranges with a phase column and a `▓▓▓░░░ n/m` bar, `🎯 Next` with `qNN` prompt rows and a `/spec:run @<spec>` top pick carrying `🚦 solo` / `⚡ N parallel lanes` / `⏳` markers, `--all` adding `🕓 after that:`, `⛔ blocked:` and `🧹 Hygiene (N) — /spec:doctor`, and the footer `🟢 next is ready · N more open · M hygiene findings (/spec:doctor)`.
  - A positional `NN` argument reporting one brief's dependency readiness, exit 1 when a dependency brief has no spec at implementing or done.
  - `--json` keeps every existing key (`roadmap`, `next`, `lanes`, `questions`, `verdict`) with its current meaning and gains `prompts`, `top`, `after`, `blocked`, `hygiene`, `open`, and `brief` fields on each roadmap row.
  - `doctor.check(root, { probe: false })` so status can count hygiene findings without running the host's test command.
  - The command drivers strip a leading `@` from their spec argument so the rendered `@path` lines paste straight back.
  - Golden-fixture snapshot tests for bare, `--all` and `NN`, plus exit-code and JSON-shape tests; the interface contract and architecture notes reconciled; plugin version 8.1.0.
- I will not touch:
  - The queue's data model or semantics: no `lane`, no `after`, no automatic fix items. Every pending prompt item renders as a `qNN` row.
  - How `next` is derived (queue order, run in flight, fan-out), fanout's lane admission, or `run.js`/`fanout.js` beyond the `@` strip.
  - Anything the v7 ledger fed: the `📈` lines, the `🧭 misunderstandings` line, the `🔴 CI is red` footer, `done since last release`. These are struck from the contract doc.
- Architecture or behaviour change: no — the screen changes, the pipeline does not.

## Goal

Running `/spec:status` on a v8 repo prints the screen JJ knew from v7: one glance shows which briefs are done, which one is being built and how far along it is, which questions wait in the queue, what to run next and whether it can fan out. `--all` adds what is not startable yet and the hygiene list; `NN` answers "can I plan this brief" with an exit code. On niko-hub the roadmap shows 02a at the same `n/m` v7 shows and the same six `qNN` rows.

## Decisions

| ID | Decision | Why |
|----|----------|-----|
| D1 | The v7 render (captured from niko-hub on 2026-11-05) is the design. Glyphs, column alignment, indentation (`   ` three spaces under the roadmap, `   └─`/`├─` branches), the bar formula (`'▓'.repeat(nDone === total ? 10 : min(9, floor(nDone/total*10))).padEnd(10,'░') + ' n/m'`) and the collapse rule (consecutive done / open / superseded briefs collapse to one range row with `done (N briefs, M specs)` or `unplanned (N briefs)`; implementing briefs never collapse) are copied, not redesigned. | JJ asked for the same UI/UX; the only latitude is wording that would lie about v8 (D5, D6). |
| D2 | Roadmap row data: brief number and slug from the file name `NN-slug.md`; phase from the header `Phase: Pn`; the implementing row label is `NN slug`; `⬜` rows say `unplanned` even though the JSON state stays `open`; `🔨` is the implementing glyph (v8's `🔶` is retired). Doneness keeps v8's rule: every spec done and the brief's queue item ticked. | `unplanned`/`🔨` are the v7 words on screen; `open` is the v8 JSON contract and stays. Doneness is behaviour and is out of scope. |
| D3 | Open work and blockers: an entry per non-done spec (`draft` → `/spec:plan`, `hardened`/`implementing` → `/spec:run`) plus one per pending prompt item. A spec's blockers are its `depends_on` specs that are not done (matched by path or basename); a draft spec also inherits its brief's `Depends on:` briefs that have no spec at implementing or done (`brief NN (state)`). `⏳` prints the blocker with directories and extension stripped. Entries sort blocked-last, then queue position (a spec's own item, else its brief's item, else last), then implementing < hardened < draft, then brief order, then path. | This is v7's `deriveNext` minus the ledger and the `after` gates, on data v8 has. |
| D4 | The top pick is the first unblocked spec entry; when a run is in flight that spec is the top pick; when a fan-out is in flight the Next block prints `/spec:fanout` alone. When no spec entry is unblocked and a brief with all dependencies met has no specs, the top pick is `/spec:plan @docs/roadmap/NN-slug.md`. Prompt rows never become the top pick. `next` in JSON keeps its current v8 derivation unchanged; the screen renders the new `top`. | v7 listed prompts as rows and picked a command underneath. `next` has tests and callers and does not move. |
| D5 | Lanes on screen are what `/spec:fanout` would actually start: the first `config.lanes` unblocked hardened queue specs in queue order (today's `lanes()` rule, plus the D3 blocker filter). Two or more print the `⚡ N parallel lanes ready — /spec:fanout` header and a `/spec:run @<spec>` line each; one prints `└─ 🚦 solo` when other open entries exist. The `🔶 merge-conflict risk: a.js, b.js (+N more)` branch lines come from File Plan path overlap between admitted lanes, pairwise, naming both specs when there are three or more lanes. | v7's brief-relation admission would show lanes fanout does not pick. The screen must not lie about the fan-out; the overlap heads-up is pure annotation and costs nothing. |
| D6 | `--all` adds `🕓 after that:` (unblocked entries that are not lanes: beyond the lane cap, not hardened, or not queued) with one `└─` reason shared by consecutive equal reasons: `⛓️ shared brief NN` or `⛓️ brief A depends on B` against an admitted lane, else `🤷 beyond the lane cap (N)`, `🤷 not queued — /spec:queue add <spec>` or `🤷 draft — /spec:plan first`; then `⛔ blocked:` with `⏳` branches; then `🧹 Hygiene (N) — /spec:doctor` listing `[kind] detail` where kind is the text before the first `: ` of each doctor finding. | Same sections, same glyphs; the reasons name v8's real causes. |
| D7 | Footer: head is v8's verdict head (`🟢 next is ready`, `🟡 waiting on you — N pending questions`, `🟢 a fan-out is in flight · /spec:fanout`, `🟢 a run is in flight · /spec:run <spec>`, `🟡 a run is waiting on you …`, `⚪ queue empty` becomes `⬜ nothing waits`), then ` · N more open` (entries minus the top pick; `nothing else open` at zero on a 🟢 line), then ` · M hygiene finding(s) (/spec:doctor)` when non-zero. `verdict` in JSON is this full footer line. | v7 footer shape; v8 heads are the states v8 actually has. Existing tests match on the glyph prefix only. |
| D8 | Hygiene comes from `doctor.check(root, { probe: false })`: identical to today's check with the `testCommand` run skipped. `doctor.js main` keeps probing. | Status must render in well under a second; the suite probe takes up to two minutes. |
| D9 | `NN` positional: `brief NN (slug): all N dependencies met` (or `all zero dependencies met`) exit 0; `brief NN (slug): UNMET dependencies — 03 (open), 05 (missing)` exit 1; unknown brief exit 2 with the remedy. `--json` with `NN` prints `{ brief, name, dependencies: [{brief, status, met}], ready }`. | v7's `--brief NN` text and exit codes; positional because the v8 command doc already promises `[NN] [--all]`. |
| D10 | `lib/driver.js` and `plan.js lock` strip one leading `@` from the spec argument; `queue.js add` already does. | The screen prints `/spec:run @<spec>` so a triple-click paste is a Claude Code file mention; the pasted command must then work. |
| D11 | JSON is additive: `roadmap[]` rows gain `phase`, `done`, `total`, `name`; new top-level keys `prompts: [{id, payload}]`, `top: {action, path, blockers[]} | null`, `after: [{action, path, reason}]`, `blocked: [{action, path, blockers[]}]`, `hygiene: string[]`, `open: number`. No existing key is renamed or re-typed. | "Extend, never rename" is the contract for `--json`. |
| D12 | Tests: a fixture repo built by the test (briefs with `Phase:`/`Depends on:` headers, specs in every state, a queue with prompt and spec items, one doctor finding) rendered bare, `--all`, `NN` met, `NN` unmet, and compared to golden files under `tests/fixtures/status/*.txt`. Exit codes and the D11 JSON keys are asserted separately. Fixture briefs use the `03`, `11a` id shapes so the `NNa` sort is covered. | Snapshot pins the UX; behavioural tests pin the contract. |
| D13 | Docs: `docs/v8/interface-contract.md` status paragraph rewritten to this screen (no `📈`, no `🧭`, `--all` and `NN` as here); `docs/v8/architecture.md` status bullet drops the `≤ 200 LOC` cap and names the dashboard; `spec/commands/status.md` passes `$ARGUMENTS` through. `plugin.json` version `8.1.0`. | The contract doc is the promise; code and doc must agree after this spec. |

## File Plan

| Path | Action | Summary |
|------|--------|---------|
| spec/scripts/status.js | MODIFY | Brief header parsing (phase, depends_on, slug), entry derivation and ordering (D3), top pick (D4), lane admission and overlap (D5), `--all` sections (D6), footer (D7), `NN` mode (D9), render, additive JSON (D11). Existing `build` keys unchanged. |
| spec/scripts/doctor.js | MODIFY | `check(root, { probe = true } = {})`; `probe: false` skips the testCommand run (D8). |
| spec/scripts/lib/driver.js | MODIFY | Strip a leading `@` from `ctx.arg` (D10). |
| spec/scripts/plan.js | MODIFY | Strip a leading `@` from the `lock` argument (D10). |
| spec/commands/status.md | MODIFY | Run `status.js $ARGUMENTS`; mention `NN` and `--all`. |
| tests/status.test.js | MODIFY | Golden snapshot tests (D12), exit codes, JSON shape; existing tests kept, with exactly two literal retags: the roadmap glyph list (`🔶` → `🔨`) and the empty-queue verdict (`/^⚪/` → `/^⬜/`). |
| tests/fixtures/status/bare.txt | CREATE | Golden render of the fixture repo, default mode. |
| tests/fixtures/status/all.txt | CREATE | Golden render, `--all`. |
| tests/fixtures/status/brief-met.txt | CREATE | Golden `NN` line, dependencies met. |
| tests/fixtures/status/brief-unmet.txt | CREATE | Golden `NN` line, unmet. |
| tests/doctor.test.js | MODIFY | One test: `check(root, { probe: false })` returns the same findings without running the test command. |
| docs/v8/interface-contract.md | MODIFY | Status paragraph reconciled (D13). |
| docs/v8/architecture.md | MODIFY | Status bullet reconciled (D13); the `🔶 implementing` mention near line 276 becomes `🔨`. |
| spec/.claude-plugin/plugin.json | MODIFY | `8.0.0` → `8.1.0`. |

## Acceptance Criteria

- **AC-20261105-01-1**: WHEN the fixture repo has briefs 01 and 02 done (specs done, items ticked), 02a implementing with 3 of 4 non-draft specs done, 03 and 04 with no specs, 05 superseded, and `Phase:` headers P0, P0, P0, P1, P1, P1 THE SYSTEM SHALL print under `🗺️ Roadmap` exactly `   ✅ 01–02  P0  done (2 briefs, N specs)`, `   🔨 02a <slug>  P0  ▓▓▓▓▓▓▓░░░ 3/4`, `   ⬜ 03–04  P1  unplanned (2 briefs)`, `   ⛔ 05 <slug>  P1  superseded` with labels and phases padded to one column each → matches `tests/fixtures/status/bare.txt`.
- **AC-20261105-01-2**: WHEN the queue holds pending prompt items q7 and q12 THE SYSTEM SHALL print them under `🎯 Next` as `q7   <payload>` and `q12  <payload>` (id padded to the longest id plus two spaces), payloads flattened to one line and cut to the terminal width (100 off a TTY) with a trailing `…`, before any command line.
- **AC-20261105-01-3**: WHEN exactly one hardened queued spec is unblocked and other open entries exist THE SYSTEM SHALL print `/spec:run @<spec>` then `   └─ 🚦 solo`; WHEN three hardened queued specs are unblocked and `config.lanes` is 3 THE SYSTEM SHALL print `⚡ 3 parallel lanes ready — /spec:fanout` followed by one `/spec:run @<spec>` line per lane in queue order, then one `   └─ 🔶 <a> × <b>: merge-conflict risk: <files>` line per lane pair whose File Plans share a path.
- **AC-20261105-01-4**: WHEN a spec's `depends_on` names a spec that is not done THE SYSTEM SHALL exclude it from lanes and the top pick, and under `--all` list it under `⛔ blocked:` as `/spec:run @<spec>` followed by `   └─ ⏳ <dependency stem>`; without `--all` the section is absent.
- **AC-20261105-01-5**: WHEN `--all` is given and an unblocked hardened spec is beyond the lane cap, not queued, or shares a brief with an admitted lane THE SYSTEM SHALL list it under `🕓 after that:` with one `   └─ ⛓️ shared brief NN` / `🤷 beyond the lane cap (N)` / `🤷 not queued — /spec:queue add <spec>` reason line, printed once for consecutive entries with the same reason.
- **AC-20261105-01-6**: WHEN `--all` is given and doctor reports findings THE SYSTEM SHALL print `🧹 Hygiene (N) — /spec:doctor` with one `   [<kind>] <detail>` line each, and SHALL NOT run the host `testCommand` (a fixture `testCommand` that writes a marker file leaves no marker).
- **AC-20261105-01-7**: WHEN the top pick is ready, 5 other entries are open and 2 hygiene findings exist THE SYSTEM SHALL end with `🟢 next is ready · 5 more open · 2 hygiene findings (/spec:doctor)`; WHEN nothing else is open → `🟢 next is ready · nothing else open`; WHEN the queue is empty and no spec is open → `⬜ nothing waits`; the `verdict` JSON key equals the footer line.
- **AC-20261105-01-8**: WHEN invoked as `status.js 03` and every brief in 03's `Depends on:` has a spec at implementing or done THE SYSTEM SHALL print `brief 03 (<slug>): all 2 dependencies met` and exit 0; WHEN one dependency has no such spec → `brief 03 (<slug>): UNMET dependencies — 02a (implementing)` and exit 1; WHEN no such brief exists → exit 2 naming the roadmap directory. `--json` prints `{brief, name, dependencies:[{brief,status,met}], ready}`.
- **AC-20261105-01-9**: WHEN `--json` is given THE SYSTEM SHALL emit an object whose `roadmap[].state` values stay within `done|implementing|open|superseded`, whose `next`, `lanes`, `questions` keep today's values on today's tests, and which contains `prompts`, `top`, `after`, `blocked`, `hygiene`, `open` → `tests/status.test.js` existing assertions pass unchanged except the two glyph retags named in the File Plan (`🔶` → `🔨`, `⚪` → `⬜`); `tests/integration.test.js`'s `next` assertion passes unchanged.
- **AC-20261105-01-10**: WHEN `node lib/driver`-based commands or `plan.js lock` receive `@specs/x.md` THE SYSTEM SHALL treat it as `specs/x.md`.
- **AC-20261105-01-11**: WHEN a fan-out is in flight THE SYSTEM SHALL print `/spec:fanout` as the only command line under `🎯 Next` (prompt rows still print above it) and the footer head `🟢 a fan-out is in flight · /spec:fanout`; WHEN a run is in flight the top pick is `/spec:run @<that spec>` and no `⚡` header prints.
- **AC-20261105-01-12**: WHEN run against ~/projects/niko-hub (manual check, recorded in the close commit message) THE SYSTEM SHALL show brief 02a with the same `n/m` bar as v7's `spec-status.js` on the same tree and the same six `qNN` rows in the same order.

## Assumptions

- A1: Brief files keep the `# NN — Title` H1 and a `Phase: Pn · Depends on: …` header line as in `templates/roadmap-brief.md` and niko-hub — if false: a brief without a header gets phase `—` and no dependencies, never a crash.
- A2: v7-written queue items on niko-hub (`lane` field present, `kind: prompt`) are readable by v8's `readQueue` unchanged — if false: the migrate step must convert them first and AC-12 is checked after that.
- A3: No v8 script consumes `status.js --json` today except the tests — if false: that consumer's keys are among the kept keys and nothing changes for it.
- A4: `doctor.check` without the probe completes in under a second on niko-hub — if false: hygiene is computed only under `--all` and the footer clause is dropped from the default render.
