# Deviations — 04-theme-before-the-client-walk

- Test-author collision sweep found two more literal collisions beyond the File Plan's explicit
  mentions, both owned by this spec's own Rationale ("the pins that assert 'never THEME' and
  'theme-picked is unknown' are the collision this spec owns"): `tests/mocks/mocks-driver-3.test.js`'s
  AC-20260907-07-2 test (`--mark theme-picked` asserted "unknown mark") and
  `tests/consistency/design-doctrine.test.js`'s AC-20260907-06-8 test (`spec/commands/sketch.md`
  step 3 required `theme open`/`theme adopt` as live commands and forbade `/spec:mocks THEME`) and
  its AC-20260907-06-9 test (`spec/doctrine/design.md` required the "picked on /spec:sketch's
  first run" sentence). All four are retagged in place, not merely deleted, per this spec's own
  A3 discipline.
- `advanceToApproved`'s new precondition (routing through `advanceToThemePicked`, per this spec's
  own File Plan note on `tests/mocks/mocks-driver-fixtures.js`) breaks every test in OTHER
  test files outside this spec's assigned batch that reaches APPROVED through that helper — 7
  tests across `mocks-driver-2.test.js`, `mocks-driver-4.test.js`, `mocks-driver-client.test.js`,
  `mocks-driver-look-stops-*.test.js` and similar siblings now fail with `unknown mark
  "theme-picked"` until the build wave lands `--mark theme-picked`. This is the sanctioned
  consequence the spec's own Rationale names ("the fixture row covers the one path
  (advanceToApproved) whose precondition set grows") — left untouched as out-of-batch.
- Two standing repo-wide gates (not named in the File Plan, which only raises `size-baseline.json`
  for `spec/scripts` files under D11) needed reconciling against this batch's new/grown test
  files, both mechanical and reversible:
  - `scripts/size-ratchet.js --root . --reconcile --cite specs/20260910/04-theme-before-the-client-walk.md`
    raised `tests/consistency/design-doctrine.test.js`, `tests/mocks/mocks-driver-3.test.js` and
    `tests/mocks/mocks-driver-fixtures.js`, and shrank `tests/mocks/mocks-driver-theme.test.js`
    and the `tests` aggregate back down (the AC-06-5/-06-6/-06-12/-06-13 test bodies this spec's
    own build removes).
  - `scripts/dup-windows.js --root . --raise tests/mocks/mocks-driver-fixtures.js --to 27 --cite
    specs/20260910/04-theme-before-the-client-walk.md` then `--update` reconciled the duplicate-
    window ratchet the same way.
- scripts-layer worker (Gotcha "Ninth trigger" class — a lock-time closure that trusted a sibling
  row rather than reading it, restated here as: the collision-closure literals leg swept the File
  Plan's own test rows but not every pre-existing pin): once `deriveState()` actually lands THEME
  between WALK and CLIENT (D3) and `doReopen`'s target list actually widens to name `theme`
  (D3/AC-20260910-04-3), two test files OUTSIDE this spec's File Plan (`tests/mocks/mocks-driver.test.js`,
  `tests/mocks/mocks-driver-walk.test.js` — neither is a File Plan row, so neither was in the
  literal-grep collision sweep this spec's own Rationale ran) go red, 13 tests total, all on the
  exact "never THEME" / "CLIENT straight off WALK" / the narrower `--reopen` literal / the
  five-key `marks` shape shape the Rationale already names as "the collision this spec owns":
  `mocks-driver.test.js` AC-20260907-07-4 (`--reopen theme` refusal literal), AC-20260907-07-5/-07-12/-08-12,
  AC-20260907-07-7 (cold `marks` shape — asserts NO `themePicked` key at all), AC-20260907-07-9,
  AC-20260907-04-13, AC-20260907-10-1, AC-20260907-10-2, AC-20260907-10-17 (×4 — the CLIENT step
  block/skill-line/look-mechanism pins); `mocks-driver-walk.test.js` AC-20260907-10-1 (setup
  assertion retag), AC-20260907-08-8. Every one of these needs the identical retag treatment this
  spec already gave `mocks-driver-3.test.js`'s AC-20260907-07-2 — the subject is gone (CLIENT
  straight off WALK, or a `marks` shape with no `themePicked`), not weakened, so the fix is
  retagging each assertion to the D3-reinstated THEME derivation / eight-key `marks` shape /
  widened `--reopen` literal, never reverting `mocks-driver.js` itself. Left unfixed here — tests
  are another worker's rows; scripts-layer confirms all 21 tests in this spec's own File Plan test
  rows (`theme-serve.test.js`, `mocks-driver-theme.test.js`, `mocks-driver-theme-2.test.js`,
  `mocks-driver-3.test.js`) are green against the code in this diff.
- Same collision class, one more: `tests/consistency/design-doctrine.test.js`'s AC-20260907-10-13
  test (its own `mocks-review-client` fixture reaches CLIENT via a pre-D3 advanceTo chain that
  never calls `--mark theme-picked`) now lands on THEME and fails the CLIENT-step literal
  assertion. `design-doctrine.test.js` IS a File Plan row (owned by the tests worker for
  AC-20260910-04-10), but this particular pre-existing test is not one of this spec's own ACs —
  left unfixed here for the same reason as the two files above (scripts-layer owns
  mocks-driver.js/design-atlas.js/lib files only, never test files).

## Repair round (D12, JJ ruling recorded as D12 in the spec's own Decisions table): clean up,
## don't retag — resolves the two entries above

The implementation landed and the 13-failure list plus `tests/consistency/design-doctrine.test.js`
AC-20260907-10-13 (the 14th, same root cause, already a File Plan row) all reddened for exactly
the reason the two entries above named. D12 ruled clean-up over retag: a test whose whole
contract this spec retires is deleted (never rewritten to assert the new shape — that shape's own
coverage lives in this spec's own File Plan test rows), and a test whose contract survives but
whose fixture no longer reaches the state it walks to is fixed once, via `advanceToThemePicked`,
never per test file.

**Deleted** (whole contract retired, each confirmed to still have executed coverage elsewhere
before removal):
- `mocks-driver-2.test.js` AC-20260907-07-5/-07-12/-08-12's "no design/tokens.css and no
  status.theme anywhere" test — its unresolved-note/no-stop refusal legs are covered by
  `mocks-driver-client-2.test.js`'s AC-20260907-10-16 (unaffected, unchanged); its accept-path
  assertions (byte-diff stamp, decider, derived APPROVED) had NO other coverage, so a minimal
  version survives under the same AC-ID, through the real theme-picked chain, with the retired
  premise dropped.
- `mocks-driver-2.test.js` AC-20260907-07-4 (`--reopen theme` must refuse) — the new accept shape
  is this spec's own AC-20260910-04-3 in `mocks-driver-theme-2.test.js`.
- `mocks-driver-client.test.js` AC-20260907-10-1's "WALK derives CLIENT directly" + "legacy
  state:SIGNOFF derives CLIENT" halves — the new WALK→THEME→CLIENT derivation is this spec's own
  AC-20260910-04-3 in `mocks-driver-3.test.js`. The "SIGNOFF absent from mocks-driver.js's source"
  clause (unrelated to the theme reinstatement) had no other coverage, so a minimal version of
  exactly that survives.
- `mocks-driver.test.js` AC-20260907-07-7's "themePicked dropped outright / legacy theme fields
  scrubbed on save" test — that scrub behavior is retired outright (themePicked and status.theme
  are live fields now); the new shape is this spec's own AC-20260910-04-6/-9. The cold-root
  marks-object key-set fact (unrelated to the scrub behavior) had no other coverage, so a minimal
  version survives with themePicked counted among the live keys.

**Fixed once, via the shared fixture** (`advanceToThemePicked` in `mocks-driver-fixtures.js`,
already added by this spec's own File Plan row): every `advanceToJourneyWalked(dir)` call whose
purpose was reaching CLIENT (not merely WALK) swapped to `advanceToThemePicked(dir)` in
`mocks-driver-client.test.js` (AC-20260907-10-2, -10-17), `mocks-driver-look-stops-4.test.js`
(all four tests), `mocks-driver-walk.test.js` (the AC-20260907-10-1 setup-assertion retag), and
`tests/consistency/design-doctrine.test.js` (AC-20260907-10-13).

**Literal-text fixes** (contract survives, only the `--reopen` enumeration string changed since
`theme` rejoined the live target list): `mocks-driver-walk.test.js` AC-20260907-08-8 and
`mocks-driver.test.js` AC-20260907-04-13, both updated to `journey:<j>, walk:<j>, shapes, kit, or
theme`.

**Fallout fixed in the same round** (both caused by the deletions/renames above, found by running
the full suite as instructed):
- `tests/test-file-budget.test.js` AC-20260910-01-7 hardcodes the full test-name text of every
  `mocks-driver-client.test.js`/`-client-2.test.js` test as a structural guard (a different
  spec's own File Plan row) — updated its `KEPT_TEST_NAMES[0]` literal to the renamed
  AC-20260907-10-1 title.
- `ac-drift.js` (a standing repo-wide gate, `tests/doctor/ac-drift-clean.test.js`) reported
  `specs/20260907/06-theme-pick-moves-to-sketch.md` ACs 06-6/06-12/06-13 as uncited once their
  covering tests were deleted (in this session's earlier, pre-repair-round work). Followed this
  repo's own established remedy (specs/20260907/07-mocks-retires-theme.md D14 set the precedent
  for exactly this situation): annotated the three bullets in that spec with `[retired:
  specs/20260910/04-theme-before-the-client-walk.md — ...]`, naming where the surviving mechanics
  now live (AC-20260910-04-6/-9). `specs/20260907/06-...md` is not on the "do not touch" list
  (spec/scripts, spec/doctrine, spec/commands, size-baseline.json) and this is the documented,
  mechanical remedy `ac-drift.js` itself names — no Decision added to either spec, mirroring D14's
  own "nothing else in that spec is touched" scope.

**Repo-wide gates reconciled again** (grown/shrunk by this round's edits, both mechanical):
`scripts/dup-windows.js --root . --update` (pure shrinkage from the deletions — the
`tests/helpers.js` `withHandler` extraction below and the deleted test bodies both lowered
several files' counts, nothing rose past its ceiling). `scripts/size-ratchet.js` was left alone
per the coordinator's explicit instruction (they own the size reconcile and will re-run it after
this lands) — as of this round it reports `tests/helpers.js` and `mocks-driver-walk.test.js`
over budget and several files stale (shrunk); `AC-20260908-01-9`'s standing test is expected red
until that reconcile runs.

**Shared `withHandler` extraction** (the coordinator's second ask, D12 clean-up spirit): the
in-process `createRequestHandler` HTTP test harness lived as three drifting copies
(`tests/design-atlas.test.js`, `tests/mocks/walk-mode.test.js`, `tests/mocks/theme-serve.test.js`)
— extracted to one `withHandler(root, fn)` / `withHandler(root, prefix, fn)` export in
`tests/helpers.js` (the same shared-helper home `runNode`/`tmpdir`/`serveAtlas` already live in);
all three call sites now import it, no signature changes needed at any of the ~19 call sites.
Extraction worked cleanly — no baseline raise was needed for this piece.

**Verified**: `node spec/scripts/comment-narration.js --root .` (0 findings — two rounds of "used
to" / "no longer" / literal-date phrasing in this round's own retag comments needed rewording to
the repo's own banned-phrase list), `node scripts/dup-windows.js --root .` (all tight),
`node --test --test-timeout=45000 --test-force-exit tests/` (1635/1637 passing; the two remaining
failures — `AC-20260908-01-9` size-ratchet and `AC-20260905-04-6`, a `spec/commands/*` doctrine
content check unrelated to any file this round touched — are both outside this round's scope per
the coordinator's own "do not touch" list).
