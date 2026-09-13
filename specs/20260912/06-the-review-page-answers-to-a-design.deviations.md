# Deviations — 06-the-review-page-answers-to-a-design

- AC-20260912-06-2's own worked parenthetical ("2 open items block approval") undercounts AC-1's
  fixture (one open note on `a`, one *addressed* note on `b`, one open project note): current
  `isOpen()` counts an addressed note as still-open (only `status !== 'resolved'` closes it),
  giving a true total of 3, not 2 — verified empirically (`node`-run `buildReviewPage` over the
  exact fixture). Neither this spec's Decisions nor its Assumptions section changes that
  semantics, so the test pins the header's "names the same total it computes" invariant against
  the fixture's own true `isOpen()` total (computed in the test, never hardcoded) rather than the
  AC's literal "2" — never a fabricated or silently-weakened number.
- D5's premise that `assertChromeTokenized`/`loadDesignAtlas` "have live callers" is false against
  the pre-image: both are call-site-orphaned too (`grep -c` on `tests/design-atlas.test.js` at
  HEAD shows 1 occurrence each — their own definitions, zero actual invocations). This does not
  change the action D5 prescribes (STAY, never delete), so both are left in place unmodified per
  the Decision's literal instruction — recorded here only because the File Plan's own rationale
  for keeping them doesn't hold up under grep.
- AC-20260912-06-9's locked bullet read `SHALL CONTINUE TO` over four headless-Chrome
  measurements, two of which the pre-image contradicts (badge `color` is `--v-fg`, `.rv-strip`
  `border-radius` is `8px`) — exactly the defect D9 fixes. `red-check.js` classified
  `tests/mocks/review-chrome.test.js` green-expected from that verb and hard-stopped the build at
  `broken-pin`. Amended in-session as D9a: AC-9 keeps the two fixed measurements as a plain
  `SHALL`, and the two that already hold split out as AC-20260912-06-12, a `SHALL CONTINUE TO`
  pin on the same file so D6's expiry-survival intent is preserved. D9's substance and the
  measurements themselves are unchanged; no assertion was weakened.
- AC-20260912-06-10's `.rv-scope` grep pin is a bare substring check over `review.browser.js` +
  `viewer.css` combined, with no word boundary — it also matches the pre-existing (pre-image)
  `.rv-scopeband` class D4 requires the page keep verbatim (its exact div and `Notes for` label
  markup is itself pinned by AC-20260912-06-3). Kept both pins green without weakening either: the
  scope-band's layout rule in `viewer.css` is now selected by `[class="rv-scopeband"]` (an
  attribute-equality selector, not a `.` class selector) and the new label is selected by
  `[data-rv="scopeband-label"]`, so neither literal `.rv-scope...` string appears in the CSS file;
  the rendered HTML still carries `class="rv-scopeband"` and `class="rv-scopeband-label"` exactly
  as D4 specifies (review-page.js is outside AC-10's combined check). No assertion in either test
  was touched. Same repair class as this rules file's own "sixth trigger" gotcha (a literal-grep
  collision from unrelated text), just the reverse direction — an EXISTING literal collides with a
  NEW ban rather than a new literal breaking an old pin.
- While re-anchoring `.rv-strip` under the new `.rv .rv-strip` (0,2,0) ancestor prefix (D9), the
  phone-width (`max-width: 480px`) override two-tenths of the file below it — `border-left: 0`,
  `border-top: 1px solid var(--v-border)` — would have stopped winning the cascade: it was written
  as bare `.rv-strip` (0,1,0), so the new higher-specificity base rule (declared earlier in the
  file but now specificity-dominant) would out-rank it regardless of source order at any width.
  Not in D9's own selector list (`.rv-strip` is named there, its media-query sibling is not), but
  left unfixed it silently reintroduces D9's exact defect class one breakpoint later. Prefixed the
  phone override to `.rv .rv-strip` too, restoring the equal-specificity/source-order tiebreak the
  override depends on; no test in this spec's file plan exercises the phone breakpoint, so this is
  recorded rather than pinned.
- D7's literal ADR filename `docs/adr/0017-the-review-page-departs-from-its-spec.md` was claimed on
  `main` by specs/20260912/08's own amendment ADR before this build started. Took the next free
  number, `docs/adr/0018-the-review-page-departs-from-its-spec.md`, and amended every mention in
  this spec in the same build (D7, both File Plan rows, A4's `if false` clause). Siblings
  specs/20260912/07 and /10 target 0018 too and carry their own next-free-number clauses.
- Orchestrator correction to the scripts wave's first departure above: selecting the scope band by
  `[class="rv-scopeband"]` and its label by `[data-rv="scopeband-label"]` to keep the literal
  `.rv-scope` out of `viewer.css` is rejected and reverted. An exact-attribute selector stops
  matching the moment the element gains a second class, so a grep pin's own spelling would have
  become a live rendering constraint. Both rules are back to plain `.rv-scopeband` /
  `.rv-scopeband-label` class selectors, and AC-20260912-06-10 is amended instead (D10a): the sweep
  bans `.rv-scope` as a complete class name, `/\.rv-scope(?![\w-])/`, never as a substring. The
  retirement it asserts is unchanged and the test was not weakened — the ban is now exact where it
  was over-broad.
- The `other` wave's single row (`spec/.claude-plugin/plugin.json`, D8) was executed by the
  orchestrator directly rather than dispatched to a worker: the row's own File Plan text names the
  exact command (`scripts/plugin-bump.js --bump --plugin spec --changelog "…"`), and the only
  judgment in it is the changelog paragraph, which the orchestrator is the seat that can write.
  Landed 7.163.0.
- Orchestrator fidelity fix at integration: the doctrine wave rendered the journey as
  `First journey` in the breadcrumb and rail of `design/chrome-mocks/review.html`, where D1 says
  the Hearwell data is replaced by the fixture names this spec's tests use — the journey label in
  that fixture is `j1`, which is also what the served page renders. Changed both occurrences; no
  other content touched.
