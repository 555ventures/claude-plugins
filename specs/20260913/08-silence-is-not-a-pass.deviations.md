# Deviations — 08-silence-is-not-a-pass

- A3's premise ("some of `writeRoadmap`'s callers name a 01- brief") is empirically false: grep of
  `tests/` for `roadmap-written` found zero test call sites that invoke `--mark roadmap-written`
  today (`writeRoadmap` itself is currently dead code — defined in
  `tests/genesis/genesis-driver.test.js`, called by no test). Nothing reddens, so there was no
  existing caller to repair. Applied the File Plan row's `writeRoadmap` edit anyway (default a
  `First light:` line onto any 01- brief unless `firstLight: null` is passed) for the fixture
  currency it asks for; it is a no-op today and verified not to change any of that file's 7
  passing tests. `tests/genesis/first-light.test.js` (new) does not call `writeRoadmap` — it
  drives its own local roadmap-writer since it needs per-case control over the header.

- A2's collision inventory (tests/release-legs/release-legs.test.js :: AC-20260823-01-6 and
  :: AC-20260830-03-4; tests/release-legs/e2e-unobserved.test.js :: AC-20260908-05-10) is
  incomplete: `node --test 'tests/release-legs/*.test.js'` post-D3 (release-legs.js already
  landed) shows THREE additional reds A2 did not name — `release-legs.test.js ::
  AC-20260823-01-1` (asserts `stage`'s exit is 0 against a fully green host whose default
  `setupWorkingHost` fixture carries no `capabilities.forge`, so `ci` falls to
  `{"unavailable":"no-adapter"}` — now correctly unmeasured, exit 1 per D3) and
  `e2e-unobserved.test.js :: AC-20260908-05-4` / `:: AC-20260908-05-5` (same root cause: both
  hosts' `ci` leg is unavailable/no-adapter, so `stage`'s now-correct exit 1 breaks their
  `r.status === 0` assertions, which were never about the e2e row these ACs actually pin).
  Doctrine files verified green (this worker's scope); leaving these three for the test/scripts
  workers per A2's own remedy: rewrite each to expect exit 1 plus the `UNMEASURED:
  ci:unavailable:no-adapter` line, keeping every row assertion byte-identical — never weaken D3.

- A fourth out-of-plan red, outside A2's `release-legs.js` scope entirely: `tests/review/
  verdict.test.js :: AC-20260813-02-4 ("v7 retag")` asserts `verdict.js --profile release` over
  six green legs plus a ci row `{"unavailable":"no-adapter"}` derives plain `CLEAN` (v7's
  retired-qualifier ruling — the exact silent-CLEAN-over-an-unmeasured-ci-leg behavior this
  spec's D2/AC-20260913-08-2 exists to replace with `UNVERIFIED`). This is the intended,
  in-spec regression the spec's own A1/D2 anticipated (not a defect in this worker's
  `verdict.js` change) but it is outside this worker's file list (tests/ is off-limits per the
  worker contract) and outside A2's named inventory. Left for the test/scripts workers: retag
  and rewrite to assert `UNVERIFIED` (the v7 CLEAN ruling is superseded by D2 for the release
  profile only — review's ci leg is untouched), never weaken D2.

- Test worker: repaired the four reds named above, per A2's own remedy. release-legs.test.js
  :: AC-20260823-01-1 now expects stage exit 1 plus UNMEASURED: ci:unavailable:no-adapter (row
  assertions byte-identical), retagged AC-20260913-08-5. e2e-unobserved.test.js ::
  AC-20260908-05-4 / -5 keep every e2e-row assertion byte-identical and now additionally expect
  exit 1 plus the same UNMEASURED: line (their fixture's ci leg was never the subject of either
  AC), both retagged AC-20260913-08-5. review/verdict.test.js :: AC-20260813-02-4 ("v7 retag")
  now asserts UNVERIFIED/exit 1 in place of the retired plain-CLEAN ruling, keeping the
  --ledger row.ci verbatim-observed assertion intact, retagged AC-20260913-08-2. Verified
  node --test --test-timeout=45000 'tests/release-legs/*.test.js' 'tests/review/*.test.js'
  'tests/genesis/*.test.js' tests/verdict-require-leg.test.js -- 313 pass, 0 fail.

- The `other` wave's single row (spec/.claude-plugin/plugin.json, D6) was executed by the
  orchestrator in-session, not a dispatched worker: it is one scripted command
  (`node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` → 7.182.0) with no
  judgment to delegate. Marked `--workers 0`.
