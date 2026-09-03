# 24 — Status and queue diet: one paste, three decisions, nothing else

Phase: P2 · Depends on: 15 (the queue this brief reshapes), 22 (in flight; its specs are the
first field run of the new screen) · Primary workspaces: spec/scripts/spec-status.js,
spec/scripts/spec-queue.js, spec/scripts/lib/queue.js, spec/commands/{status,queue,doctor}.md,
tests · Risk: T3 (spec-status.js is a critical-tier frozen surface; the `--next --json` shape
and the queue verbs change) · Design stage: no · Expected specs: 2

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
language. `/spec:queue` shows only pending items, numbered by position, one brief at most
once, and is edited with one verb: `move <ref> <n>`. A brief that lands on the roadmap is
placed last with no accept step. The acceptance picture, measured on this repo on 2026-09-03:

```
🗺️ Roadmap
   ✅ 01–21                    P1–P3  done (24 briefs, 48 specs)
   🔨 22 mocks-first-genesis   P2     ▓▓▓▓▓░░░░░ 3/6
   ⬜ 23 closed-feedback-loop  P2     unplanned

🎯 Next
/spec:run @specs/20260902/09-one-hand-wireframes-one-token-set.md

⚠️ Brief 23 is new in the queue, placed last.
   Move it up?  spec-queue move 23 1

🟢 next is ready · 2 specs wait behind it
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
3. **Positional queue** — `spec-queue list` prints pending items only, numbered 1..n, no
   internal ids, done count in a footer, and ends with the edit hint. `move <ref> <n>`
   replaces bump/defer/`add --after` (those stay one release as aliases that print the
   move form). Auto-placement places last and marks 🆕 for one session; there is no `ok`.
   A brief item may exist at most once — `add --brief` and the reconciler refuse a
   duplicate. `--when` predicates stay in the file format and are never printed by `list`.

## Out of scope

- New anomaly kinds or new checks of any sort — this brief only removes and relocates.
- Session-start injection of the queue (ruled out 2026-08-30, stays out).
- Changing what `--next` derives (blockers, lane admission, action strings) — only how it
  renders. Brief 15 and 16 own the derivation.
- A priority field on queue items. Order is the priority; that ruling holds.

## Grounding

- `.claude/rules/spec-pipeline.md` § Risk Tiers — spec-status.js is critical-tier; the
  `--json` shape is a frozen API. Scope 1 is bound by it.
- specs/20260823/08-derived-session-queue.md D4 (brief doneness never stored), D7 (`list` is
  read-only), D11 (`--next --json` append-only), D14 (ticks stamp the item) — all stay.
- specs/20260823/08 § Rationale — why the queue is an overlay and status the sole reader.
- spec/commands/doctor.md check 13 — the landing zone for hygiene anomalies.
- Memory rulings 2026-08-30 (no session-start queue hook) and 2026-08-31 (no design-coverage
  anomaly in status).

## Open questions for planning

- Does any external `--json` consumer read `anomalies[]` from `spec-status.js --next --json`
  and expect the hygiene kinds there? Grep the fleet at plan time; if none, the hygiene
  kinds may leave the `--next` payload and stay in `--json` (full) only.
- Should `skipped-spec` (a done spec whose dependency is not done) be `decide` or `hygiene`?
  Default hygiene: it describes the past, not a choice.
- Is one release of `bump`/`defer`/`ok` aliases enough, or do host command docs cite them?
  Grep `spec/commands` and host `CLAUDE.md`s at plan time.
