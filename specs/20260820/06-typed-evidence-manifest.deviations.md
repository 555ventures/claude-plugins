# Deviations — specs/20260820/06-typed-evidence-manifest.md (test batch)

- `tests/review/verdict.test.js` AC-20260819-01-1/-01-6/-01-7's shared `retentionFixture` elongated
  the promise-sweep leg's `observed` to a 300-char raw STRING to pin the byte-untruncated-artifact
  vs 120-char-ledger-slice contract. D1 makes any string-observed row unconditionally
  manifest-invalid, so that fixture is now structurally impossible to construct as a valid row, and
  promise-sweep's own typed shape (`{"rows":N,"carried":N,"sanctioned":N,"orphans":N}`) has no
  free-text field to elongate. Substituted the optional `drift` leg (not in `REVIEW_LEGS`, green,
  never feeds `legFindings`), whose Contract shape (`{"summary":"<first stdout line>"}`) is the one
  per-leg shape built for free text — grounded in D2 ("free-text fields ... bounded to 120 chars AT
  THE EMITTER") and D11 ("objects are not sliced"). AC-20260819-01-6's assertion direction flips
  accordingly: verdict.js's own truncation ternary already only fires on `typeof observed ===
  'string'`, so an object-shaped `observed` was never truncated by verdict.js even pre-migration —
  the test now pins that no-truncation behavior explicitly (drift leg's 300-char `summary` prints at
  full length in both the ledger row and the retained artifact) instead of the retired
  scalar-string-observed 120-char ledger slice.

- `tests/review/verdict.test.js` AC-20260805-02-8 (STOP-path partial release manifest): the
  pre-image asserted that a present-but-unparseable e2e row's key is OMITTED from the ledger row
  (the old `parseCounts()` re-derive-or-omit behavior). D3 inverts this: release ledger keys copy
  `observed` VERBATIM whenever the row is present, regardless of shape — omission only applies to a
  leg genuinely ABSENT from the manifest. Rewrote the e2e sub-case to fixture a present-but-off-shape
  observed object (`{"note":"..."}`) and assert it is copied verbatim into `row.e2e`, while
  `journeys`/`substrate`/`production` (genuinely absent — the STOP fired before they ran) still omit
  their keys. This is a direct, explicit consequence of D3's Contracts text, not a guess.

- `tests/review/legs-verdict-pair.test.js`: A8 names `AC-20260820-03-11` (the skipReportPattern
  unmatched-branch pair test) as an em-dash literal pin requiring retag, but no AC in this spec's own
  15-item list (`AC-20260820-06-1` .. `-06-15`) textually covers its content (skip-pattern mismatch +
  `legFindings >= 1`) — `AC-20260820-06-5`/`-06-6`/`-06-7` are all about `testCountPattern`/at-risk.
  Retagged it as an `AC-20260820-06-5` companion (same test file, same D10 "extended to the typed
  gate branches" umbrella as the skip-pattern-MATCH case that `AC-20260820-06-5` explicitly retags
  from `AC-20260820-03-10`), rather than inventing a new AC-ID per the standing Gotcha's prohibition
  on placeholder IDs.

- `tests/review/promise-sweep.test.js` AC-20260817-07-8's plan-lock (no-`--manifest`) branch (found
  during the scripts batch, not fixed here — out of this batch's file list): the test reuses the
  same `decisionsRows: ['| D1 | does X | why |']` fixture (no AC-ID citation, no `[no-ac:]` tag) for
  both the `--manifest` half above it and the new `specNoManifest` case, then asserts
  `resNoManifest.stdout.trim()` fully matches `^promise-sweep: rows=\d+ .../$` — but that Decisions
  row is a genuine orphan (per AC-20260817-07-2's own pin, same row shape), so `promise-sweep.js`
  correctly prints a `HARD  orphan-decision …` line before the byte-unchanged counters line (D8),
  and the anchored regex fails on the two-line stdout. `promise-sweep.js`'s stdout format is
  unchanged before/after this spec's migration (verified: `rows=1 carried=0 sanctioned=0 orphans=1 ·
  1 finding(s)` is the identical pre-image format) — the mismatch is the fixture producing a finding
  the new assertion didn't expect, not an implementation defect. Left unedited (tests/ files are
  outside spec/scripts/*.js|*.sh, the scripts batch's assigned surface); flagged for the tests/
  batch owner or reviewer to give `specNoManifest` a carried or `[no-ac: …]`-sanctioned Decisions
  row.

- `tests/review/promise-sweep.test.js` AC-20260817-07-8 / AC-20260820-06-9's plan-lock branch (the
  gap flagged in the entry above this one, now repaired): the assertion anchored
  `resNoManifest.stdout.trim()` against `^promise-sweep: rows=…$` for the WHOLE buffer, which
  asserts "stdout has no other lines" — a claim AC-20260820-06-9 never makes. The
  `specNoManifest` fixture's lone Decisions row genuinely cites no AC-ID and carries no
  `[no-ac:]` tag, so `promise-sweep.js` correctly prints a `HARD orphan-decision …` line before
  the counters line; the counters line itself was byte-correct both before and after this spec's
  migration. Re-scoped the pin to match the counters line wherever it appears via the `m` flag
  (`^…$` now anchors to line boundaries, not the whole string) and dropped `.trim()` so the
  match runs against raw stdout; the regex body and the byte-exact format contract are
  unchanged. Fixture and AC-ID left untouched — this was an assertion-scope bug, not a fixture
  or implementation defect.

- `spec/.claude-plugin/plugin.json` (doctrine batch): the spec's version-bump target (7.12.0) was
  already taken at HEAD by a concurrent session — the sanctioned race this repo's Gotchas document
  (specs/20260810/02 D11). Bumped to the next free version, 7.13.0, with the same changelog content
  the spec specifies (typed `observed`/deleted packed-string parser), and trimmed the description's
  changelog to its standing last-3-versions form (7.13.0/7.12.0/7.11.0), dropping the now-fourth
  7.10.0 paragraph.
