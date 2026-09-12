# Deviations — 05-the-atlas-answers-to-a-design

- AC-20260912-05-5's `grep -c 'parseLedger(' ` SHALL return `1` clause was amended at build. The
  number is impossible and contradicts D7(c), the Decision it illustrates: the pre-image has five
  `parseLedger(` lines and D7(c) collapses only the two byte-identical route sites (2143, 2683),
  leaving three distinct uses — `nextClientLedgerId(parseLedger(rewritten))`, a text-arg
  read-and-catch, and `parseLedger(ledgerText).assumptions.find(...)` — so the post-fix total is
  four. Per pipeline rules § Gotchas ("an example that contradicts its Decision is a defect in the
  example, never a licence to change the Decision"), the clause was restated as D7(c)'s actual
  promise: the `design/mocks/ledger.md` read-and-catch literal occurs exactly once, inside a single
  `readLedgerRows(` helper both former route sites call. The superseded text is retained as an
  indented sub-line under the AC bullet.
- AC-20260912-05-1's own text is "SHALL CONTINUE TO" throughout (D3's one-frame-per-screen rule
  shipped unspecced on 2026-09-12, per the Goal), but its `→` pointer verb is `rewrites
  tests/design-atlas.test.js :: build: a mock with no brief AND no claim is an orphan` — the exact
  self-contradiction the pipeline rules § Gotchas name (`rewrites` demands the named case be RED;
  CONTINUE-TO text demands it already pass). Verified empirically: the seed-journey/one-iframe/
  states-meta assertions I added run green against the untouched pre-image, because
  `buildAtlas` already implements D3/D4 (grep-confirmed before writing any test). Resolution taken
  as test worker (not a spec amendment, which is out of scope here): the new AC-1/AC-2/AC-4
  assertions are authored as sanctioned green-pre-change regression pins on the already-shipped
  fix, appended into the named existing test (and a new sibling test for AC-2) rather than forcing
  an artificial red. AC-20260912-05-3 (the `?clean`/`:has(>…)` qualifier) is likewise
  green-pre-change — `CLEAN_STYLE` already carries the qualifier in the pre-image.
- AC-20260912-05-5's literal text only spells out D6 (the three deletions) and D7(b)/(c)
  (`insertBeforeBodyEnd`, the ledger read-and-catch), but the Decisions table cites AC-5 for the
  whole of D7(a)-(d). To avoid under-covering the Decision (§ Gotchas: "a D-row promising X AND Y
  carried by an AC asserting X alone is 'carried' … the unbuilt half reaches review as a reviewer
  finding or not at all"), I additionally pinned D7(a) (the `esc` import swap from
  `./lib/stop-block`) and D7(d) (`/__notes/list` calling `reviewPageLib.joinQuestions` instead of
  its own inline join) inside the same AC-5 test file. Both assertions are genuinely red against
  the pre-image (verified by running the suite).
- AC-20260912-05-1's `→` pointer verb was corrected at build from `rewrites` to `reuses`. The AC's
  own text is SHALL CONTINUE TO throughout — D3/D4's one-frame-per-screen and shotlink rules
  shipped unspecced on 2026-09-12 (commit b43217a) and this AC pins them against regression — but
  `rewrites <file> :: <name>` demands the named case be RED against the pre-image, so red-check
  hard-stopped at `gutted-rewrite`. This is the self-contradiction pipeline rules § Gotchas names
  verbatim; its stated remedy is to fix the verb. `reuses` demands the named case be GREEN, which
  is what a CONTINUE-TO pin promises. No test was weakened and no assertion was moved.
- D7(b) (spec/scripts/design-atlas.js, `injectNotesScript`): the pre-image's own fallback for an
  `</body>`-less document prepended an extra `'\n'` before the injected `<meta>`/`<script>` tag
  (`html + '\n' + tag`) that `insertBeforeBodyEnd`'s shared fallback (`html + snippet`) does not
  add. Delegating to `insertBeforeBodyEnd` exactly once (AC-20260912-05-5's own pinned call-count)
  means that leading newline is dropped in the `</body>`-less edge case only; every mock this
  route serves carries a `</body>` tag (the served-mock fixtures all do), so no test observes a
  difference and none was weakened. Calling `insertBeforeBodyEnd` twice (once per branch) to
  preserve the byte exactly would violate the same AC's "exactly once" call-count assertion, so
  the one-newline delta was accepted rather than the two-call alternative.
- D2's clause was placed mid-paragraph rather than immediately after the bold lead-in, and the
  paragraph was re-wrapped to its original three lines. Two forced corrections, both at
  integration. First, appending the clause straight after `**Plugin chrome is a designed
  surface.**` produced "designed surface.** — the atlas index binds to", a period immediately
  followed by an em dash; the clause now attaches after "never on product tokens", which reads as
  the sentence D2 describes and keeps every literal the AC-20260912-05-6 regex spans. Second, the
  five-line form pushed `/spec:init`'s read-load budget to 737 > 735 — `spec/doctrine/design.md`
  is budget-capped and has no slack, the fifth trigger in pipeline rules § Gotchas' reflow entry.
  The paragraph was packed back to three lines with each grepped literal kept whole on one line
  (`**Plugin chrome is a designed surface.**`, both `design/chrome-mocks/*.html` paths, and
  `stays gray.`), never split across a wrap. No budget number was raised.
