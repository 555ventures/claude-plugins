# Deviations — 02-plugin-code-sweep

- AC-20260902-02-1's original `--json` clause (`Object.keys(files).filter(k =>
  /^(spec\/scripts|spec\/bin|scripts|tests)\//.test(k)).length === 0`) was structurally
  unsatisfiable: `comment-narration.js` builds `files` from the directory walk (one key per
  scanned file, value = finding count), so the 14 code-group files already at zero findings
  keep their keys forever, for any non-empty tree — verified empirically against the live
  scan. The coordinator amended the AC in place at build (plain ID kept, superseded formula
  demoted to an indented sub-line under it) to the three clauses matching this spec's Goal:
  the `--baseline` run exits 0, the tracked baseline holds no key matching the code-group
  regex, and `--json` → `findings.filter(f => codeGroupRegex.test(f.file)).length === 0`.
  `tests/consistency/comment-narration-live.test.js`'s `AC-20260902-02-1` test was updated
  in place to assert all three clauses; verified red (`r.status !== 0`) against the current
  unswept tree.
- Bucket T2 (tests worklist): `tests/tracked-text-purity.test.js` and
  `tests/verdict-gatered-no-workflow.test.js` each open with an informal `JJ-YYYYMMDD-NN`
  incident id that is also the (untouchable, D3) test name's own leading token. The scanner's
  `\bJJ\b` person check fires on that id structurally — no rewording of the surrounding prose
  can clear it while the id stays literal, and inventing a replacement id is banned by this
  spec's citation rule. Since the id already survives byte-for-byte in the protected test
  name, the header's restatement of it was dropped (D2's own "restated facts... deleted at
  the second occurrence") rather than reworded, with a plain pointer to "this file's own test
  name" left in its place; both files rescan at zero findings.
- Bucket T4: `tests/review/reviewer-scope-identity.test.js`'s header (the only comment in the
  file) had no spec path, AC-ID, or escape/run id anywhere — `.claude/spec-runs.jsonl` and the
  roadmap carry no id for the 2026-09-01 mutation-replay-measured scope-identity miss it pins,
  and the file's own tests carry no AC-ID (this is agent-doctrine prose-pinning, per the file's
  own closing note). The Owner citations fallback ("else the citation is dropped along with the
  sentence") was not applied verbatim: the paragraph is the mechanism rationale for the two
  tests below it (why `reviewer.md` needs a Scope identity section and the two-executed-check
  rule), not a historical account, so only the leading date was struck and the paragraph kept
  uncited rather than deleted. Flagged here since a literal reading of the fallback would have
  deleted the file's only comment; rescans at zero findings and the `--code-identical` check
  reports the file unchanged.
- The build driver refused every `--mark tests-authored` for this spec: `handleTestsAuthored`
  verified each tests-layer File Plan path with a literal `fs.existsSync`, so the row
  `tests/**/*.test.js` — a glob form this spec sanctions and that `red-check.js` and
  `scope-reconcile.js` both already expand through the shared `lib/glob-match.js` — could never
  be satisfied and the build could not leave TESTS. Escalated to JJ, who ruled "fix the driver
  now" (recorded as D10). The fix expands a pattern row through `lib/glob-match.js` (satisfied
  by at least one match; a literal path still by its own existence) and names the unmatched
  pattern in the refusal; `tests/build/build-driver.test.js` gained one behavioral test
  exercising both branches, deliberately carrying no AC-ID so red-check does not read it as a
  carried-red expectation. Observed: 26/26 in that file green after the fix; the refusal itself
  was observed live against this spec before it. Consequence: two more files are legitimately
  `code-changed` under D6’s oracle.
- D9's literal version-bump target (7.57.1) was already taken by HEAD (`d63af56`, the
  design-stage hand-off fix) before this worker ran — the same class the host's Gotchas
  record (specs/20260810/02 D11, specs/20260901/08 D10): a spec's literal version number is
  a target, not a pin. Bumped to the next free version, 7.57.2, with the changelog paragraph
  written under that number and the manifest's `version` field matching it; the leading
  changelog entry's version equals the declared manifest version, and the oldest entry
  (7.56.1, build→review boundary) was dropped to hold the last-3 cap. Verified:
  `node --test 'tests/consistency/plugin-version.test.js'` — 4/4 green.
- Second occurrence of the D10 defect class, same build: `--mark wave-done` was refused because
  `verifyWaveRows` also tested each File Plan path with a literal `fs.existsSync`, so the scripts
  wave rows (`spec/scripts/*.js`, `spec/scripts/*.sh`, `spec/scripts/lib/*.js`) could never
  verify. Resolved under JJ’s existing D10 ruling rather than a fresh escalation — it is the same
  literal-path assumption in a sibling handler, not a new decision — by routing the same
  `lib/glob-match.js` expansion through `verifyWaveRows`. D10 was amended in place to record both
  handlers.
- The `other` wave (`.claude/comment-narration.baseline.json`, D7) was applied by the orchestrator
  rather than a dispatched worker, and marked `--workers 0`. The artifact was a single
  deterministic edit — remove every code-group key, keep the 16 prose-group keys — already
  authored and verified by the test author earlier in this build, then restored to the pre-image
  for red-check’s purity refusal. Re-applying a byte-verified artifact needed no worker judgment.
- D7’s Phase-1 ordering could not be honoured: red-check refuses to run when any non-tests File
  Plan path already differs from the base, and the baseline JSON is an `other`-layer row. The
  shrink was reverted for the red-check run and re-applied at the `other` wave. The pin was
  genuinely red either way — with the pre-image baseline it fails the "baseline holds no
  code-group key" clause; with the shrunk baseline it fails the scan-exit-0 clause.
- D6’s oracle at build close does NOT report `identical` for every file, and cannot: it exits 1
  naming exactly three `code-changed` files, each one this spec itself required to change.
  (1) `tests/consistency/comment-narration-live.test.js` — the retag this spec’s own Orchestrator
  duties mandate; retagging a test and adding the AC’s three clauses is by definition an
  executable-line change. (2) `spec/scripts/spec-build-driver.js` and
  (3) `tests/build/build-driver.test.js` — D10’s glob-expansion fix and its behavioral test.
  No fourth file differs, so the sweep itself is proven behaviour-neutral across all 157
  code-group files. None of the three is a host § Risk Tiers surface, so D8’s tier-upgrade
  trigger does not fire and the spec stays `standard`. Recorded here as the executed oracle
  result; review re-runs the same command against `diff_base` and should observe the same three.
  Executed: `comment-narration.js --root . --code-identical d63af56912c35f44c6c1763055185cf3456e2c2f`
  → exit 1, "3 files differ". Final gate: 953 tests, 953 pass, 0 skipped, exit 0.
