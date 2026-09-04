---
date: 2026-09-03
status: implementing
tier: critical           # spec-status.js is a named critical trigger (.claude/rules/spec-pipeline.md § Risk Tiers): frozen --root/--next/--json surface
area: session-queue
design: false
breaking: false
depends_on: [specs/20260903/03-pipeline-queue-mechanics.md]
depended_on_by: []
brief: 24
open_markers: 0
diff_base: 90c89d2364043c7fe2fac506fdf76c8b9e142cd7
---

# Status diet — roadmap, one paste, at most three decisions, one footer

## Goal

`/spec:status` fits one screen and answers one question: what do I paste next. The default
render is exactly four blocks — 🗺️ Roadmap (unchanged), 🎯 Next (the paste line), up to three
⚠️ decide lines (one sentence, one question, one paste each), and a one-line footer. The
anomaly fold, the ⚠️ Anomalies section, the ⚡/🕓/⛔ lane render, the 📡 block and the
headline verdict leave the default screen; the lanes, the blocked list and the hygiene
catalogue live behind `--all`; every hygiene kind lives in `/spec:doctor` check 13. Done
means: on this repo the screen is the acceptance picture in brief 24, and `--json` /
`--next --json` / `--next` are byte-for-byte what they were, plus an additive `audience`
field on anomalies.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Default render order and content: 🗺️ Roadmap block exactly as today (rows, collapse, the 🧭 misunderstandings line inside it) → `🎯 Next` header + the same lines `--next` prints after its header (top pick; ⏳ blocker branch lines only when the top is blocked) → zero to three decide lines → one footer line. Nothing else prints by default: no anomaly fold, no ⚠️ tags on Next lines, no ⚠️ Anomalies section, no ⚡/🚦/🕓/⛔ lane render, no 📡 block, no headline verdict line (AC-20260903-05-1, AC-20260903-05-2, AC-20260903-05-8) | Brief 24 § Result: "nothing else, ever — a rule that can detect something does not earn a line here" |
| D2 | Every anomaly kind is classified once, in code, by audience: `DECIDE = {skipped-brief, out-of-order}`; every other kind (`queue-unparseable`, `queue-orphan`, `unknown-status`, `orphan-stamp`, `unparsed-dependency`, `unknown-dependency`, `skipped-spec`, `hand-tracked-status`) is `hygiene`. Each anomaly object gains `audience: "decide"\|"hygiene"`; decide anomalies additionally gain `line`, `ask`, `paste` (Contracts). `detail` stays for `--json` consumers and doctor (AC-20260903-05-3, AC-20260903-05-4) | Brief 24 § Scope 2; `skipped-spec` is hygiene because it describes the past, not a choice (brief 24 § Resolved) |
| D3 | Decide render, per anomaly: `⚠️ {line}` then `   {ask}  {paste}` (three-space indent, two spaces between question and paste). Cap three in derivation order (`skipped-brief` before `out-of-order`, roadmap order within a kind); the overflow count goes to the footer. `--all` prints all of them (AC-20260903-05-3, AC-20260903-05-5) | The paste must be triple-click clean, so it ends the line; the question is the only context a cold reader needs |
| D4 | Footer, one line, glyph + one sentence: `🔴 CI is red on {path} — {branch}@{sha} ({url})` when any done spec's observation is red (the Next line is already the `/spec:escape` entry); else `🟠 next is blocked · waiting on {short blocker}` when the top entry has blockers; else `🟢 next is ready` + clauses; else `⬜ nothing waits` + clauses. Clauses, each only when non-zero, in this order: `· {n} wait behind it` (or `· nothing waits behind it` on the 🟢 line when n = 0), `· {m} could run in parallel (--all)`, `· {k} more to decide (--all)`, `· {h} hygiene finding(s) (/spec:doctor)` (AC-20260903-05-5, AC-20260903-05-6, AC-20260903-05-8) | The footer is the last line a tail-showing terminal lands on; it must carry the verdict and every count that changes what the user does next, and nothing that does not |
| D5 | `--all` (new flag; usage 2 combined with `--next` or `--brief`): the four blocks with the decide cap lifted, then `📋 All open work` — today's lane render verbatim (`⚡ N parallel lanes…` / `🚦 solo` / `🕓 after that:` / `⛔ blocked:` with their branch lines, text unchanged) — then `🧹 Hygiene ({h}) — /spec:doctor` with one `   [kind] {detail}` line per hygiene anomaly, then the footer (AC-20260903-05-7) | Brief 24 § Scope 1: the blocked list and the anomaly catalogue move behind `--all`; keeping the lane text byte-identical keeps the eight lane tests as in-place `--all` retags instead of rewrites |
| D6 | Frozen surfaces stay: full `--json` top-level keys `briefs, specs, superseded, anomalies`; `--next --json` top-level `["next"]` and entry shapes; the lean `--next` render byte-identical; `--pretty` still a no-op; `--brief` preflight unchanged (AC-20260903-05-9) | .claude/rules/spec-pipeline.md § Risk Tiers; 20260823/08 D11 |
| D7 | Doc + version: `spec/commands/status.md` is rewritten to the four-block contract (print verbatim, narrate one sentence, never list hygiene kinds — `--all` and `/spec:doctor` are the pointers; the hand-tracked-column strip offer moves under `--all`'s hygiene list); `spec/commands/doctor.md` check 13 names the audience split (hygiene kinds are its findings; decide kinds are info); plugin.json bumps to the next free minor (target 7.75.0) [no-ac: doctrine prose + version pin enforced by tests/consistency/plugin-version.test.js and the review's doctrine-without-bump hard check] | New-surface checklist; check 13 is the declared landing zone (brief 24 § Grounding) |
| D8 | The 📡 Observation block is deleted; a red observation renders as the `/spec:escape` Next line plus the 🔴 footer carrying branch, sha and url (AC-20260903-05-6) | The alarm keeps its supremacy (20260805/03 D5, 20260823/08 D10) and its evidence, in the two lines that survive the diet |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-status.js | MODIFY | scripts | `--all` flag; `AUDIENCE` map + `line/ask/paste` on decide anomalies at push time; default render = four blocks (D1/D3/D4); lane render + hygiene list only under `--all` (D5); anomaly fold, ⚠️ Anomalies section, 📡 block, headline line deleted; header comment updated (owner: this spec) |
| spec/commands/status.md | MODIFY | doctrine | Rewrite to the four-block contract per D7 |
| spec/commands/doctor.md | MODIFY | doctrine | Check 13 names the `audience` split; hygiene kinds are findings, decide kinds info |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump (target 7.75.0, next-free rule) + changelog paragraph |
| tests/status/status-diet.test.js | CREATE | tests | AC-20260903-05-1, AC-20260903-05-2, AC-20260903-05-3, AC-20260903-05-4, AC-20260903-05-5, AC-20260903-05-7, AC-20260903-05-8 |
| tests/spec-status.test.js | MODIFY | tests | Lane/solo/heads-up tests (eight) retagged to AC-20260903-05-7 with `--all` added to their invocation, assertions unchanged; the AC-20260807-01-1 order test and the anomaly-fold test rewritten in place to the four-block order and the no-fold rule (retagged AC-20260903-05-1 / -3); `skipped-brief`/`orphan-stamp`/`hand-tracked` render tests re-pointed at `--all` output; AC-20260903-05-9 retags the --json key-set pins |
| tests/status/red-alarm.test.js | MODIFY | tests | AC-20260807-01-7's 📡 line assertion rewritten in place to the 🔴 footer line (retagged AC-20260903-05-6); last-line glyph assertions unchanged |

## Contracts

Anomaly object (full `--json`, append-only):

```json
{ "kind": "out-of-order", "audience": "decide",
  "detail": "brief 19 (escape-seeded-replay) is unplanned while later brief 22 has moved — deliberate reordering or a skip; if it still matters: /spec:plan docs/roadmap/19-escape-seeded-replay.md",
  "line":  "Brief 19 (escape-seeded-replay) is unplanned while later brief 22 has moved on.",
  "ask":   "Still wanted?",
  "paste": "/spec:plan @docs/roadmap/19-escape-seeded-replay.md" }
{ "kind": "skipped-brief", "audience": "decide",
  "detail": "…unchanged…",
  "line":  "Brief 22 (mocks-first-genesis) moved on, but its dependency 19 (escape-seeded-replay) was never planned.",
  "ask":   "Plan it now?",
  "paste": "/spec:plan @docs/roadmap/19-escape-seeded-replay.md" }
{ "kind": "orphan-stamp", "audience": "hygiene", "detail": "…unchanged…" }
```

Default render (literal, this repo's shape):

```
🗺️ Roadmap
   ✅ 01–23  P1–P3  done (26 briefs, 55 specs)
   ⬜ 24–25  P2     unplanned (2 briefs)

🎯 Next
/spec:plan @docs/roadmap/24-status-and-queue-diet.md

⚠️ Brief 19 (escape-seeded-replay) is unplanned while later brief 22 has moved on.
   Still wanted?  /spec:plan @docs/roadmap/19-escape-seeded-replay.md

🟢 next is ready · 1 waits behind it · 2 hygiene findings (/spec:doctor)
```

Footer grammar: `{glyph} {sentence}` where sentence = head + zero or more ` · clause`;
heads: `next is ready` · `next is blocked · waiting on {blocker}` · `CI is red on {path} —
{branch}@{sha} ({url})` · `nothing waits`. Singular/plural: `1 waits behind it` /
`2 wait behind it`; `1 hygiene finding` / `2 hygiene findings`.

`--all` layout: Roadmap → Next → all decide lines → `📋 All open work` (today's lane block,
verbatim) → `🧹 Hygiene ({h}) — /spec:doctor` + `   [kind] detail` lines → footer.

CLI: `spec-status.js [--root <dir>] [--json] [--brief NN | --next | --all]`; `--all` with
`--next` or `--brief` is usage (exit 2); `--all --json` is the full `--json` (the flag is a
render switch only).

## Behavior

- **Wait count** `n` = every `deriveNext()` entry other than the top pick (unblocked
  runner-ups + blocked + gated), escape entries excluded. **Parallel count** `m` = admitted
  lanes beyond the top under today's pairwise lane admission (unchanged logic, just not
  rendered by default). **Decide overflow** `k` = decide anomalies beyond the third. **Hygiene**
  `h` = anomalies with `audience: "hygiene"`.
- **Nothing next**: the Next block prints `   ✨ {nothingNextLine()}` as today; the footer is
  `⬜ nothing waits` plus the hygiene clause when non-zero.
- **Blocked top** (every entry blocked): the Next block prints the top blocked entry's command
  and its ⏳ branch lines exactly as `--next` does; footer `🟠 next is blocked · waiting on
  {shortBlocker(first blocker)}`.
- The 🧭 misunderstandings line, the roadmap collapse rules, the TTY redraw, and every
  derivation stay as they are; only the render changes.

## Acceptance Criteria

- **AC-20260903-05-1**: WHEN the default render runs on a host with one hardened spec under
  brief 01 and a hand-tracked overview cell THE SYSTEM SHALL print, in order, a `🗺️ Roadmap`
  block, a `🎯 Next` block, and a footer line as the last non-empty line, and no line
  containing `Anomalies`, `anomal`, `⚠️ hand-tracked-status`, `⛔`, `🕓`, `⚡`, `📡`, or a
  trailing `⚠️` tag on the Next line (literal: the Next line is exactly `/spec:run
  @specs/20260701/01-x.md`; the footer is exactly `🟢 next is ready · nothing waits behind it ·
  1 hygiene finding (/spec:doctor)`) → tests/status/status-diet.test.js
- **AC-20260903-05-2**: WHEN the top pick is unblocked and two other specs are open THE
  SYSTEM SHALL print exactly one command line in the Next block (literal: lines between
  `🎯 Next` and the next blank line = `["/spec:run @specs/…/01-billing.md"]`) and the footer
  `🟢 next is ready · 2 wait behind it` → tests/status/status-diet.test.js
- **AC-20260903-05-3**: WHEN briefs 01 (done), 02 (unplanned), 03 (implementing, depends on
  01, 02) exist THE SYSTEM SHALL print the decide pair `⚠️ Brief 03 (reports) moved on, but
  its dependency 02 (billing) was never planned.` / `   Plan it now?  /spec:plan
  @docs/roadmap/02-billing.md` and no `[skipped-brief]` line (literal two lines) →
  tests/status/status-diet.test.js
- **AC-20260903-05-4**: WHEN `--json` runs on that host THE SYSTEM SHALL emit the
  `skipped-brief` anomaly with `audience: "decide"`, `line`, `ask`, `paste` exactly as the
  Contracts example shape, an `orphan-stamp` anomaly with `audience: "hygiene"` and no
  `line`/`ask`/`paste` keys, and `detail` unchanged on both (literal: `paste ===
  "/spec:plan @docs/roadmap/02-billing.md"`) → tests/status/status-diet.test.js
- **AC-20260903-05-5**: WHEN five decide anomalies exist (five unplanned briefs below a moved
  brief) THE SYSTEM SHALL print exactly three `⚠️` decide lines by default and the footer
  clause `· 2 more to decide (--all)`, and print all five under `--all` (literal counts) →
  tests/status/status-diet.test.js
- **AC-20260903-05-6**: WHEN a done spec's latest observation is red THE SYSTEM SHALL print
  the Next line `/spec:escape @specs/20260701/01-auth-core.md`, no `📡` line, and the footer
  `🔴 CI is red on specs/20260701/01-auth-core.md — main@deadbee
  (https://github.com/x/y/actions/runs/9)` as the last non-empty line (literal) →
  tests/status/red-alarm.test.js
- **AC-20260903-05-7**: WHEN `--all` runs on a host with two parallel-ok briefs, one serial
  runner-up, one briefless spec and one blocked spec THE SYSTEM SHALL CONTINUE TO print the
  lane block exactly as today's default render did — `⚡ 2 parallel lanes…`, the two bare lane
  commands, `🕓 after that:` with its `⛓️`/`🤷` branch lines, `⛔ blocked:` with its `⏳` branch —
  under a `📋 All open work` header, and WHEN it runs on a host with an orphan stamp print
  `🧹 Hygiene (1) — /spec:doctor` followed by `   [orphan-stamp] …`; `--all --next` exits 2
  (literal: the eight existing lane assertions, retagged, pass against `--all`) →
  tests/spec-status.test.js, tests/status/status-diet.test.js
- **AC-20260903-05-8**: WHEN every spec is done and no brief is ready THE SYSTEM SHALL print
  `   ✨ nothing actionable — all specs done; 1 unplanned brief(s) blocked on unmet
  dependencies` under `🎯 Next` and the footer `⬜ nothing waits`; WHEN every open entry is
  blocked THE SYSTEM SHALL print the top entry's command with its `⏳` branch and the footer
  `🟠 next is blocked · waiting on 01-inflight` (literal) → tests/status/status-diet.test.js
- **AC-20260903-05-9**: WHEN `--json`, `--next --json`, `--next`, `--pretty`, and `--brief NN`
  run THE SYSTEM SHALL CONTINUE TO emit the key sets, the lean `--next` render, the
  `--pretty` no-op identity, and the preflight exit codes pinned today (literal: top-level
  keys `["anomalies","briefs","specs","superseded"]` and `["next"]`; `--next` stdout `🎯
  Next\n/spec:run @specs/20260701/02-ready.md`) → tests/spec-status.test.js

## Assumptions (escalation triggers)

- A1: The lane render is a self-contained block in today's script (the `if (unblocked.length)
  … if (blocked.length)` region) and can move under `--all` without touching `deriveNext()`.
  **Verified by read 2026-09-03** (spec-status.js render section). — **if false:** extract it
  to a function first; the ACs are unchanged.
- A2: `--all` is rejected by the pre-image, so its tests start red. **Executed 2026-09-03**:
  `node spec/scripts/spec-status.js --root . --all` → usage, exit 2. — **if false:** the
  red-check flags it; re-derive.
- A3: The live screen on this repo today prints 2 `queue-auto-placed` anomalies and nothing
  else anomalous; after spec 03 lands it prints zero anomalies, so this repo's acceptance
  picture has no decide line (the brief's ⚠️ example is illustrative). **Executed 2026-09-03**:
  `spec-status --root . --json | jq '.anomalies[].kind'` → `queue-auto-placed ×2`. — **if
  false:** nothing; the fixtures in the ACs carry their own anomalies.
- A4: The affected suites are green at HEAD (spec 03 A4, same run). — **if false:** STOP.
- A5: `tests/replay/replay.test.js` asserts `anomalies` deep-equals `[]` on a replay-row
  ledger and is unaffected by the additive `audience` field (an empty array has no entries to
  widen). **Verified by read 2026-09-03** (line ~2280). — **if false:** update that pin in
  place, never weaken it.

## Rationale

The dashboard grew one section per detection rule for a month; the brief measured 23 lines
of which one paste line mattered. This spec inverts the default: the render starts from what
the user pastes and adds only what a human must decide, with every count that could change
the next action folded into one footer sentence. Everything that was useful to *some* reader
some of the time — lanes, the blocked list, the hygiene catalogue — is one flag away rather
than deleted, and the hygiene kinds keep their `detail` strings so `/spec:doctor` check 13
and any `--json` reader see no regression.

D2's classification is a code-level map so the split can never drift between the render and
`--json`; D3's `line/ask/paste` fields are computed where the anomaly is pushed, so the
wording lives once. The two decide kinds are the only anomalies whose remedy is a choice the
user makes ("still wanted?", "plan it now?"); every other kind is a file to fix, which is
doctor's language.

The footer's hygiene clause is a deliberate exception to "nothing else": a user whose only
open spec has a typo'd `status:` would otherwise see "nothing waits" and no hint that the
roadmap is silently broken. One count with a pointer costs no line.

Rejected: keeping the anomaly fold for decide kinds (the tag competes with the paste on the
same line); a `⚠️ Decide` header (the brief's picture has none — the ⚠️ glyph is the
header); rendering lanes by default when they exist (JJ: the only actionable line is the
first one; the parallel count in the footer is the pointer); deleting the lane render
outright (eight pinned tests and a real use under parallel worktrees).

**Regression pins:** AC-20260903-05-7 and -9 retag the lane and frozen-surface tests in
place; the AC-20260807-01-1 order test, the fold test, and the 📡 line assertion are the
three whose pinned render this spec deliberately changes — rewritten in place, retagged,
never weakened, never left red.

**Collision closure (lock, 2026-09-03; specs/20260814/05 D6/D12):** literals leg over
`⚠️ Anomalies`, `No anomalies`, `done-but-red`, `⛔ blocked`, `🕓 after that`, `🚦 solo`, `📡`,
`anomal` — hits in `spec/scripts/spec-status.js`, `tests/spec-status.test.js`,
`tests/status/red-alarm.test.js`, `spec/commands/{status,doctor}.md` are File Plan rows;
`docs/canonical/status.md`'s `📡` sentence is replaced by this spec's Canonical Delta at close.
Waived: `docs/roadmap/*.md`, `docs/audit/*.md`, `.claude/spec-preimage/*` (history and waived
prefixes); `spec/scripts/lib/queue.js`, `spec/scripts/replay.js`,
`tests/queue/queue-overlay.test.js` (the `anomal` stem in comments only); `tests/replay/replay.test.js`
(asserts `anomalies` deep-equals `[]` on a replay-row ledger — an empty array is unchanged by
the additive `audience` field, A5). Paths-leg `executes` hits outside the File Plan —
`tests/frontmatter/frontmatter.test.js`, `tests/replay/replay.test.js`,
`tests/review/review-driver.test.js`, `tests/queue/queue-overlay.test.js` — all run
`spec-status.js` with `--json` or `--next`, surfaces AC-20260903-05-9 keeps byte-identical; no
fixture repair owed.

## Canonical Delta

`docs/canonical/status.md`, first paragraph is replaced by:

> Observation is a red alarm, not a certification (specs/20260807/01). v7.0.0 retired
> `observe-ci.js` (no new `stage:"observe"` rows are written); `spec-status.js` still derives
> `observation: n/a|ok|red` from historical rows; only red renders — the `/spec:escape` entry
> tops `--next` as the oracle-shaped pick and the dashboard footer turns 🔴 carrying branch, sha
> and url. The default dashboard is four blocks — 🗺️ Roadmap, 🎯 Next (the paste line, with ⏳ branch
> lines only when the top pick is blocked), up to three ⚠️ decide lines (`skipped-brief`,
> `out-of-order`: one sentence, one question, one paste), and a one-line footer whose glyph
> is the verdict (🔴 red CI, 🟠 blocked, 🟢 ready, ⬜ nothing) and whose clauses carry the
> wait, parallel, overflow and hygiene counts. `--all` adds the lane render, the blocked list
> and the hygiene catalogue. Every anomaly carries `audience: decide|hygiene` in `--json`;
> hygiene kinds are `/spec:doctor` check 13's findings and never render by default.
