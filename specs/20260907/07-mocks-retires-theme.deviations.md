# Deviations — 07-mocks-retires-theme

- Collision-closure gap: `tests/mocks/mocks-driver-theme.test.js` (created by
  specs/20260907/06-theme-pick-moves-to-sketch.md, not a row in this spec's File Plan) contains
  `AC-20260907-06-10`, a CONTINUE-TO pin asserting `--mark direction-composed`, `--mark
  theme-picked` and `--reopen theme` keep being accepted, and that a journey-approved root keeps
  deriving `THEME` — directly contradicted by this spec's D1/D3/D6, and it also imports the
  now-deleted `advanceToDirectionComposed` fixture export.
  Confirmed empirically: after the mandatory fixtures.js orchestrator-duty edit,
  `node --test tests/mocks/mocks-driver-theme.test.js` reddens `AC-20260907-06-10` with
  `TypeError: advanceToDirectionComposed is not a function` (and the test would still be
  behaviorally false even with a stub export, since the driver marks it exercises are retired
  by D3/D6 once the implementation wave lands).
  This file is outside my assigned File Plan batch and I have not touched it, per the worker
  contract ("touch only the files listed"). It needs a follow-up File Plan row (test edit, no
  new AC — delete or retag `AC-20260907-06-10` the same way this spec's own
  `AC-20260906-02-7`/`--reopen theme` test was retired) before the build's whole-suite gate can
  go green. This also means Assumption A3's claim that "no test outside this File Plan fails" is
  not quite accurate against the current tree — one out-of-plan file (this one) does fail, for
  the reason above.
- Fixture repair, not covered by any File Plan row but forced by the mandatory
  `mocks-driver-fixtures.js` orchestrator-duty edit (advanceToApproved/advanceToThemePicked
  deletion): `tests/mocks/mocks-driver.test.js`'s `AC-20260907-04-15` test swapped its
  `advanceToThemePicked(dir)` setup call for `advanceToJourneyApproved(dir)` and dropped the
  "theme set" clause from its name — the pre-spec migration hazard it pins (a legacy root with
  no `marks.kitSignedOff` key at all) never depended on a theme being present.
- Fixture repair, not covered by any File Plan row but forced by the same orchestrator-duty
  edit: `tests/mocks/mocks-driver.test.js`'s `AC-20260907-04-13` test's `--reopen bogus` literal
  assertion was updated from the nine-target list to the D6-narrowed
  `--reopen must be journey:<j>, shapes, or kit` literal, since AC-20260907-07-4 already governs
  this exact string via a different trigger (`--reopen theme` itself); `tests/mocks/mocks-driver-
  3.test.js`'s `AC-20260906-02-2` test's live-mark-name loop dropped `direction-composed` and
  `theme-picked` (nine live marks -> seven) for the same reason — both are collisions the plan's
  literal-closure sweep did not name explicitly (the Gotcha "a locked Decision that retires a
  literal can leave a live assertion of the retired form outside the File Plan" class), fixed in
  place and retagged where a dedicated AC existed to retag onto.
- D11 named 7.101.0 as its version-bump target, per the pipeline rules' own Gotcha ("a spec
  Decision naming a literal version-bump target can be stale by build time"). By the time this
  doctrine batch ran, `spec/.claude-plugin/plugin.json` was already at 7.117.0 (specs 04/05/06
  and other siblings had landed and claimed 7.98.0–7.100.0, then further siblings pushed past
  that). `node scripts/plugin-bump.js --bump --plugin spec --changelog "..."` derived the next
  free minor, **7.118.0**, per § Planning's version-bump discipline; recorded here rather than
  treated as a blocker, per the Gotcha's own guidance that the literal is a target, not a pin.
- D9's premise that `spec/commands/mocks.md` already carried the paragraph "Every authoring step
  block the driver prints carries the frontend-design skill line…" as prose merely being
  relocated from `## THEME interview rule`'s trailer is false against this build's HEAD — that
  literal appears nowhere in the file before this edit (confirmed by grep, matching the note
  already present in `tests/consistency/design-doctrine.test.js`'s AC-20260907-07-11 header
  comment). Authored the paragraph net-new as the closing paragraph of `## The driver loop`
  rather than moving one, satisfying the AC as written.
- D9's premise that the Look rule's `<step>` enumeration already read `shapes | kit |
  journey:<j> | signoff` before THEME's deletion is also false against HEAD: the pre-edit
  enumeration was `` `shapes`|`journey:<j>`|`theme`|`signoff` `` — it never named `kit` at all.
  Deleting only `theme` per D9's literal instruction would have left `` `shapes`|`journey:<j>`|`signoff` ``,
  which fails AC-20260907-07-11's exact-match assertion on the four-token form. Added `kit` to
  the enumeration so it matches both the AC and the KIT state's own `stop open kit` surface
  documented earlier in the same file; the pick-stop parenthetical is unaffected by this
  addition — it never named `kit` and the AC does not require it there.
- D13(a)'s premise that `AC-20260902-09-3`'s other three literals (`never a half-styled middle`,
  `dense screen first`, `gray until confirmed`) survive byte-identical once `recompose` drops is
  false against the landed doctrine: `dense screen first` lived in the SAME deleted "Theme =
  recompose, never repaint" bullet's closing clause ("every direction is judged on the dense
  screen first…"), not in a separate surviving sentence. Confirmed by grep: the phrase is absent
  from `spec/doctrine/mocks.md` and `spec/doctrine/design.md` after the D8 edit, present only in
  the dated `docs/roadmap/22-mocks-first-genesis.md` record. Dropped `dense screen first` from
  the same test's literal loop and test name for the identical reason D13(a) gives for
  `recompose` — its subject retires with the same deleted bullet — leaving `never a half-styled
  middle` and `gray until confirmed` as the two remaining checked literals.
