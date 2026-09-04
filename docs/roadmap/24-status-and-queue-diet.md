# 24 — Status and queue diet: one paste, three decisions, nothing else

Phase: P2 · Depends on: 15 (the queue this brief reshapes), 22 (in flight; its specs are the
first field run of the new screen) · Primary workspaces: spec/scripts/spec-status.js,
spec/scripts/spec-queue.js, spec/scripts/lib/queue.js, spec/commands/{status,queue,doctor}.md,
tests · Risk: T3 (spec-status.js is a critical-tier frozen surface; the `--next --json` shape
and the queue verbs change) · Design stage: no · Expected specs: 3

<!-- One brief = one /spec:plan session = 1–4 sibling specs. Execution-shaped detail belongs in
     the spec. This brief names WHAT and WHY and where the ground truth lives. -->

---

## Result

`/spec:status` fits one screen and answers one question: what do I paste next. It prints the
roadmap block exactly as today, one paste line, at most three things only a human can decide
(each as one plain sentence plus the one command that resolves it), and a one-line footer.
Nothing else, ever — a new rule that can detect something does not earn a line here. Every
file-hygiene finding (a bad status word, a typo'd dependency, a hand-tracked status cell, an
unreadable queue file) lives in `/spec:doctor`, which is the linter and already speaks that
language. The queue is written by the pipeline — every deferred promise a report would narrate
("after spec 05, plan brief 26"; "this fix goes first") becomes a queue item at the moment it
is made — and read only through this screen. `/spec:queue` shows pending items numbered by
position, one brief at most once, and is edited with one verb: `move <ref> <n>`. A brief
that lands on the roadmap is placed last with no accept step. The acceptance picture, measured on this repo on 2026-09-03:

```
🗺️ Roadmap
   ✅ 01–21                    P1–P3  done (24 briefs, 48 specs)
   🔨 22 mocks-first-genesis   P2     ▓▓▓▓▓░░░░░ 3/6
   ⬜ 23 closed-feedback-loop  P2     unplanned

🎯 Next
/spec:run @specs/20260902/09-one-hand-wireframes-one-token-set.md

⚠️ Brief 19 (escape-seeded-replay) is unplanned while later brief 22 has moved on.
   Still wanted?  /spec:plan @docs/roadmap/19-escape-seeded-replay.md

🟢 next is ready · 2 wait behind it
```

## Why this brief

Measured 2026-09-03 on this repo, the same day the screen was called unreadable:

- **Status printed 23 lines; 4 of them were one bug.** Every brief writes its dependencies
  as `16 (the review driver this brief mirrors)`; the parser rejected the item, silently
  dropped the dependency from three briefs, and printed a full remediation paragraph per
  instance. Fixed direct as 7.66.0 — but the shape that let it happen is the target here:
  11 anomaly kinds all render in status, each carrying its own remedy prose, none capped.
- **The anomaly text is written for the rule's author.** `[unparsed-dependency] … is not a
  brief id (NN or NNa) — ignored; if it names a spec-level gate, move it into the brief
  body` names the mechanism, not the decision. JJ's ruling: an anomaly line that takes more
  than one second to understand is not read at all.
- **The queue list is unreadable and leaky.** `spec-queue list` prints 16 items of which 12
  are done, keyed by internal ids (q7, q13), with brief 23 present twice (one auto-placed,
  one hand-added), and never says how to reorder. The reorder verbs exist (`bump`, `defer
  --after`) but nothing on screen tells you.
- **The "accept auto-placement" decision is a decision nobody wants.** Every new brief earns
  an anomaly until `spec-queue ok` is run. The information content is zero: the brief is
  where the queue put it, and if that is wrong the user moves it.
- **Next carries a blocked list that never changes what you paste.** Every waiting spec is
  printed under ⛔ with its blocker; the only actionable line is the first one.

## Current state

- `spec-status.js` (specs 20260823/08 and later) is the one derivation of roadmap state; its
  `--next --json` shape is frozen for external consumers (`.claude/rules/spec-pipeline.md` §
  Risk Tiers). Its render section computes an "anomaly fold" (anomalies about a spec with a
  Next line are tagged onto that line; the rest stand alone) and prints ⛔ blocked entries.
- Anomaly kinds today: queue-unparseable, queue-auto-placed, queue-orphan, unknown-status,
  orphan-stamp, unparsed-dependency, unknown-dependency, skipped-brief, out-of-order,
  skipped-spec, hand-tracked-status. All render in status; none is capped.
- `spec-queue.js` is the sole writer of `<git-common-dir>/spec-queue.json`; verbs: next,
  list, add (`--top | --after`, `--when` predicates), bump, defer, done, ok. Doneness is
  evaluated only through `lib/queue.js`'s `isItemDone`, shared with status's overlay.
- `/spec:doctor` check 13 already runs the roadmap derivation and reports its anomalies; the
  hygiene kinds would land there without a new check family.
- Memory rulings that bind: no design-coverage anomaly in status (2026-08-31); no
  session-start queue injection, ever (2026-08-30); `--next` is the sole Next: source.

## Scope

1. **Status diet** — the screen is exactly four blocks: 🗺️ Roadmap (unchanged), 🎯 Next (one
   paste line, no tags, no blocked list), ⚠️ Decide (≤3 lines, only kinds a human must rule
   on; each line = one plain sentence + one paste), footer (glyph + one sentence with the
   wait count). The anomaly fold is deleted. The blocked list and the full anomaly catalogue
   move behind `--all`. `--next --json` keeps every existing field; the render is what
   changes (D11 of 20260823/08 stays honored).
2. **Anomaly split by audience** — each kind is classified once, in code, as `decide`
   (stays in status) or `hygiene` (doctor check 13 only). Decide: skipped-brief,
   out-of-order. Hygiene: everything else. queue-auto-placed is deleted as a kind (see 3).
   Every surviving line is rewritten in the reader's language: what happened, one question,
   one paste — the wording bar is the acceptance picture above.
3. **Pipeline-written queue** (rewritten at planning, 2026-09-03 — JJ: "how da heck should
   I keep track of these messages"). The queue is the pipeline's memory for the promises a
   report would otherwise narrate and lose: "after spec 05 lands, `/spec:plan` brief 26",
   "this fix spec goes first". The writer is the pipeline, never the user; the user reads
   `/spec:status`. Concretely:
   - Items carry an optional **after-gate** (`after: {spec: <path>}` or `{brief: NN}`): the
     item is not *ready* until that target is done. The pick is the top item that is undone
     **and** ready; a gated item sinks with its gate named (visible under `--all`, never on
     the diet screen). This retires 20260823/08 D3's "no hold state" ruling.
   - A third item kind, **`spec`** (a spec path), so an ad-hoc fix spec (`brief: n/a`) can be
     queued at the top instead of sorting below every queued brief. Its command and doneness
     derive live like a brief item's.
   - **Commands write items instead of sentences.** Every report site that defers work
     (plan's discovered-work step, review close, escape's staged fix, and the shared
     close-the-loop rule) writes the item first — `--top` when the session judges it urgent
     (a fix spec, a red gate, the user's words), last otherwise — and the report lists what it
     wrote under a `queued` slot. A deferred action that appears only as prose is a defect.
   - A brief that lands on the roadmap is placed **last, silently**: no 🆕 mark, no accept
     step, no anomaly (`queue-auto-placed` is deleted as a kind; `auto_placed` stamps are
     dropped from the file). If the session that wrote the brief wants it first, it says so
     with `--top`.
   - Verbs shrink to `next` (reconcile + print the pick), `list` (pending items only,
     numbered 1..n, no internal ids, gates shown, done count in a footer), `add <payload>
     [--top | --at <n>] [--after-spec <path> | --after-brief NN] [--when …]`, `move <ref>
     <n>`, `done <ref>`. `bump`, `defer`, `ok`, `add --after <ref>`, `add --brief` are
     removed outright (exit 2 naming the replacement) — no host or global instruction cites
     them (fleet grep 2026-09-03), and their only callers are the command docs this brief
     rewrites. A brief or spec item exists at most once: `add` refuses a duplicate, the
     write-path reconcile collapses existing duplicates to the first occurrence.
   - `/spec:queue` stays as a thin command surface for the one thing a human ever pastes — a
     `move` handed over by a status Decide line — and for the pipeline's own writes.
     `spec-queue next` is plumbing, not a user surface.

## Out of scope

- New anomaly kinds or new checks of any sort — this brief only removes and relocates.
- Session-start injection of the queue (ruled out 2026-08-30, stays out).
- Changing what `--next` derives (blockers, lane admission, action strings) — only how it
  renders. Brief 15 and 16 own the derivation.
- A priority field on queue items. Order is the priority; that ruling holds — `--top` /
  `--at <n>` express urgency as position, never as a stored rank.
- Preempting a running `/spec:run`. The queue changes what `Next` recommends after the
  current run, never what is already executing.

## Grounding

- `.claude/rules/spec-pipeline.md` § Risk Tiers — spec-status.js is critical-tier; the
  `--json` shape is a frozen API. Scope 1 is bound by it.
- specs/20260823/08-derived-session-queue.md D4 (brief doneness never stored), D7 (`list` is
  read-only), D11 (`--next --json` append-only), D14 (ticks stamp the item) — all stay.
- specs/20260823/08 § Rationale — why the queue is an overlay and status the sole reader.
- spec/commands/doctor.md check 13 — the landing zone for hygiene anomalies.
- Memory rulings 2026-08-30 (no session-start queue hook) and 2026-08-31 (no design-coverage
  anomaly in status).

## Resolved at planning (2026-09-03)

- `anomalies[]` never existed in `--next --json` (executed: top-level keys are `["next"]`);
  it lives only in the full `--json`, whose sole consumers are doctor check 13 and
  `spec-queue.js` (which reads `briefs` only). Every kind stays in the full `--json` with an
  additive `audience` field; nothing leaves the payload.
- `skipped-spec` is `hygiene` — it describes the past, not a choice.
- No alias release: no host, global instruction, or memory cites `bump`/`defer`/`ok` (fleet
  grep 2026-09-03); the removed verbs exit 2 naming the replacement.
- The "new brief placed last" nudge is dropped entirely: JJ ruled its information content is
  zero, and a session that wants a brief first says `--top` when it writes the brief.
