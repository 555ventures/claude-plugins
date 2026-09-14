# Deviations — 20260913/02-the-layer-owns-one-mode-and-the-page-owns-the-card

- D14/A7 tree cleanup ran as a revert COMMIT on the spec branch rather than a working-tree
  revert: the WIP interaction hunks had already been committed into `cb1bd33` ("harden
  20260913/02 and stage the region-note card work in progress") before the build started, so
  "returned to HEAD" was no longer reachable by discarding uncommitted changes. Commit
  `e232a7ee` restores `spec/scripts/lib/notes-layer.browser.js`,
  `spec/scripts/lib/review.browser.js`, `spec/scripts/lib/review-page.js`,
  `spec/templates/mocks/viewer.css` and `design/chrome-mocks/review.html` to their `e96fd62`
  content — the pre-image D14 names. The reason-chip retirement stays queued outside this diff
  as `~/.claude/spec-wip/claude-plugins-reason-chips-part1.patch`, exactly as D14 requires.
- `diff_base` corrected at Phase 0 from `cb1bd33a194a7a31b07ee5bb533304d74e22cbd8` (the driver's
  own stamp, taken before the revert) to `e232a7eef4bff691d1e42935dfc3a3ec65fafe17`, so the
  judged range carries this spec's own re-authoring and not the revert of a superseded WIP.
- `design/atlas/index.html` was also committed in `cb1bd33` although the spec's Rationale
  records it as an untracked generated render. It is outside D14's five files and outside this
  spec's File Plan, so it was left as-is rather than untracked mid-build.
- D4's clamp bound is `document.documentElement.scrollWidth/scrollHeight` captured ONCE, before
  this layer mounts anything of its own, and cached (`pristineDocW`/`pristineDocH`), rather than
  read live at drag time. Live at drag time would clamp against a bound this layer has already
  inflated itself: the in-flow strip it inserts after `rootEl` (unframed, mock scope) adds real
  document height beyond the mock's own (measured: a 1440×900 fixture's `scrollHeight` reads 1065
  once the empty strip panel mounts), which is exactly the scenario AC-20260913-02-3 exercises —
  live clamping produced `h:265` against the AC's own `≤100`. Caching pre-mount matches A3's
  executed measurement (clamped `240×100` against a 1440×900 document) and the AC's own worked
  example, neither of which account for this layer's own chrome.
- AC-20260913-02-2 (`[env: CHROME_BIN]`) could not be driven green without weakening its
  assertion or editing the test (out of this batch's file list — tests/mocks/*.test.js is the
  tests layer). Its own header comment assumes a press at (900,28) starts "clear of" `.nl-bar`
  ("left of the bar's right-edge column"); measured against this repo's actual (pre-existing,
  untouched-by-this-spec) bar — four buttons plus the open-count badge, widened further because
  the fixture presses 'm' before dragging, so the mark button already reads "Marking · Esc to
  stop" — `.nl-bar`'s own `getBoundingClientRect()` is `{left:795, right:1393, top:13,
  bottom:45}`, so (900,28) lands ON the bar's own first button, not on the overlay. `pointerdown`
  therefore never reaches the overlay for this specific press, `setPointerCapture` is never
  called, and every subsequent move hit-tests to whatever bar button is physically under it —
  exactly the D2 mechanism working as designed, given a press that never actually starts on the
  element it is meant to capture from. Confirmed independently: `.nl-region` opacity IS
  pointer-events:auto and D2's capture mechanism itself is proven working by every OTHER AC in
  this file (AC-1, -4, -5, -7, -8 all start their drags at coordinates that land on the overlay
  and behave correctly). No Decision authorizes narrowing or hiding `.nl-bar` during arming/
  drawing to free that screen region, so this was not attempted. Recommend correcting the test's
  press coordinate (e.g. `{x: 500, y: 500}` to `{x: 900, y: 500}`, clear of the fixed top-right
  bar entirely) in a tests-layer follow-up.
- AC-20260913-02-8 (`[env: CHROME_BIN]`) reads `getComputedStyle(...).opacity` exactly 150ms
  after a click, against viewer.css's `.nl-region { transition: opacity .15s, ... }` (a doctrine
  rule, unmodified by this spec beyond the `.45` value D10 adds) — a transition whose OWN
  duration exactly equals the test's own wait, with zero margin for the browser's own well-known
  one-frame latency between a synchronous style mutation and the next style-recalc that actually
  starts a CSS transition's clock. Measured repeatedly and consistently (`0.453849`–`0.466781`,
  never `0.45`) on real headless Chrome. Two mitigations were tried and rejected: deferring
  `openNoteCard`'s card build a frame past the selection's own class toggle (via
  `requestAnimationFrame`, so the transitioning class's paint could not be delayed by the card it
  triggers), and a forced synchronous reflow immediately after the class toggle. Neither
  measurably closed the ~1-frame gap, and the deferral was reverted on its own merits regardless
  (coordinator review, 2026-09-13): no Decision asks for a card that opens a frame late behind an
  abort guard, and it is unrequested surface for a fix that did not work. `openNoteCard` builds
  its card synchronously, as the pre-image did; the `renderOverlay` badge-rebuild skip (D9's own
  keyed-reconcile shape — update only what changed) is kept. This is the class of race
  `.claude/rules/spec-pipeline.md`'s Gotchas call out under "a single sample of async work" — a
  wait exactly matching a transition's own duration is a race, not an assertion, on any correct
  implementation using a real CSS transition. Recommend the tests-layer widen the wait (e.g.
  200ms) or poll for `opacity !== '1'` with a bound, in a follow-up.
- Tests-layer follow-up (2026-09-13), answering the two recommendations above now that the
  scripts layer has landed: AC-20260913-02-2's press point was corrected from a hardcoded
  (900,28) to a measured one — the test now reads `.nl-bar`'s own `getBoundingClientRect()` live
  from the fixture (inside its own shadow host, since `.nl-bar` is not in the light DOM) and
  derives `from`/`to` from that rect (left minus 80 to right plus 80, at the bar's own vertical
  center) so the press starts clear of the bar and the drag still crosses its full width — the
  discriminator (a drag through the layer's own chrome) is unchanged, only the coordinates are
  now measured rather than guessed. AC-20260913-02-8's single 150ms sample was replaced with a
  bounded poll (up to 20x50ms = 1s past the click) that breaks early once both boxes read their
  settled values and otherwise reports its last sample; the assertions are unchanged (1 and 0.45
  exactly). Confirmed: `CHROME_BIN=".../Google Chrome" node --test 'tests/mocks/*.test.js'` now
  reports tests 67 / pass 67 / fail 0.
- Tests-layer follow-up (2026-09-13), a measured performance defect in these two files:
  `notes-layer-interaction.test.js` (8 `[env: CHROME_BIN]` tests) and `review-board-card.test.js`
  (4) each called the single-page `withChrome` once per test — 12 headless-Chrome PROCESS spawns
  across the pair — where every other Chrome-driving file in `tests/mocks` needs at most one.
  `node --test`'s default concurrency multiplied that into a thrash: whole-suite duration went
  from 42927ms (these two files moved aside) to 974438ms with them present, starving two
  unrelated wall-clock-bounded tests (`release-legs.test.js` AC-20260823-01-3,
  `render-gate.test.js` AC-20260824-01-12) into measuring roughly 930s for work that normally
  takes seconds, and timing out this batch's own AC-20260913-02-7 at 45s with 928s elapsed — no
  behavior change in any of them, pure resource starvation. Fix, additive to
  `tests/mocks/chrome-harness.js` only (its existing `withChrome` export is unchanged in
  behavior): `withChrome`'s single spawn-plus-one-target body was split into
  `launchChrome(chrome, opts)` (spawns Chrome once, opens the DevTools socket, returns
  `{send, rawSend, listeners, deadlineMs, close}`) and `openPage(launch)` (opens one
  target/session against an already-launched instance, returns the same
  `{navigate, evalJs, setViewport, sleep, send, sessionId, close}` shape the old callback
  received, `close` here closing only that target); `withChrome` itself is now `launchChrome` +
  `openPage` + `fn(page)` + `launch.close()`, byte-identical in observable behavior to before the
  split. Both test files now call `launchChrome` once in a top-level `before` hook (`node:test`'s
  `before`/`after`, used bare — no `describe` needed) and `after` closes it; each test opens its
  own `openPage` target against its own fresh `serve()` fixture (unchanged — every case is still
  independent, no state carried between tests) and closes only that target. Verified twice:
  `CHROME_BIN=".../Google Chrome" node --test 'tests/mocks/*.test.js'` reports tests 67 / pass
  67 / fail 0, duration_ms ~15100 (down from ~23100 with the per-test launches); and the whole
  suite path-less (`node --test --test-timeout=45000 --test-force-exit --test-reporter=spec
  --test-reporter-destination=stdout`) reports tests 1186 / pass 1186 / fail 0, duration_ms
  44432.87 — the same order as the 42927ms baseline with these files moved aside, not the prior
  974438ms.
