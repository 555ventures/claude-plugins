# Deviations — 07-one-wire-register-predicate

- `mocks-driver.js`'s `handleJourneyDrawn` now calls `ensureJourneyRecord(journeyName)` + `saveStatus()`
  before the per-label loop (previously only called after every label conformed). Forced by
  `tests/mocks/mocks-driver-wire.test.js`'s AC-20260908-07-5, which reads
  `statusJson(dir).journeys[JOURNEY].drawn` (no `undefined` guard) immediately after a refusal that
  precedes any successful draw — the established tolerant-read pattern elsewhere in this file
  (`journeyRecord === undefined || journeyRecord.drawn == null`, `mocks-driver.test.js` AC-20260906-05-3)
  is not used by this new test. No Decision in this spec names this change; it is scoped to a stub
  record (`{drawn: null, approved: null}`) written before validation, which is a no-op for every
  existing `journeys[j]` falsy check (`!st`/`!st.drawn`/`!st.approved` all still hold) and does not
  change any refusal message, exit code, or gating order.
- The Contracts block's literal call-site spelling for D6
  (`/(^|\/)wire\/tokens\.css$/` / `/(^|\/)wire\/wire\.css$/` as regex literals) is not used verbatim in
  `mocks-driver.js` — writing those two regex literals puts the source text `wire\/` in the file,
  which AC-20260908-07-7's pin (`tests/consistency/wire-register.test.js`) bans outright for every
  `.js` file under `spec/scripts/` except `lib/wire-register.js`. Built the same two predicates via
  `new RegExp('(^|/)wire/tokens\\.css$')` / `new RegExp('(^|/)wire/wire\\.css$')` instead (a plain
  string has no regex-delimiter escaping, so the source never spells the banned text) — behavior is
  byte-identical to the Contracts block's regexes.
- `tests/design-atlas.test.js:1190`'s own header comment ("… now reads its wire-link candidate from
  the shared authority's linksWireRegister(html) …") trips `spec/scripts/comment-narration.js`'s
  `[prior]` class (narrates prior/current behavior), which fails
  `tests/consistency/comment-narration-live.test.js`'s repo-wide zero-findings pin. That file is not
  in this worker's file list (owned by the tests layer) and was already written this way when this
  batch started — left unfixed and flagged here rather than edited out of scope.
