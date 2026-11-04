# Review close

The CLOSE phase of the review stage writes into the repo — the spec's Canonical Delta lands in
`docs/canonical/{area}.md`, the deviations fold lands in the host's pipeline rules — and it
does so *after* the review's gate leg has already run over the diff. Until 2026-08-30 those
writes were never re-checked, so the files the pipeline itself authored were the one surface
the host's deterministic enforcement could not see (two escapes recorded in salon-os,
2026-08-30).

The standing rules:

- **The close mark is gate-enforced.** `--mark closed` re-runs the host's resolved
  `gateCommand` over the committed close tree and refuses the mark while it is red — exit 2,
  `marks.closed` never set, state otherwise unchanged. No review can close with the gate
  broken by its own close writes. The refusal names the failed command, carries the last 40
  lines of its output, and names the remedy: fix the flagged files, commit the fix, re-run
  `--mark closed`.
- **It runs last, over the committed tree.** The gate re-run sits after the deviations
  refusals, the Gotchas ratchet, and the dirty-tree check, so cheap refusals fire first and
  the gate observes exactly the tree the dirty-tree check just certified — never an
  intermediate state.
- **An unresolvable gate refuses, never skips.** When resolution yields no runnable gate
  (`gateCommand` names `{testDirs}` but the spec's File Plan has no test rows) or the host
  config is unreadable, the mark is refused with the reason and the remedy named. A skipped
  check is the vacuous-green class this enforcement exists to close.
- **One derivation of gate resolution.** `spec/scripts/lib/gate-resolve.js` exports
  `resolveGate(specText, config)` — the single `{testDirs}`/`{scopeDirs}` substitution, shared
  by `review-legs.js`'s gate leg and the driver's close-time re-run. A paraphrased second copy
  is a drift seam; the two must never disagree about what the host's gate is.
- **Cost is accepted by contract.** Each close attempt runs the resolved gate, then the bare
  `testCommand` — the second run is skipped only when `gateRunsSuite()` (`lib/gate-resolve.js`)
  proves the gate just ran the whole suite over the same close tree, and the driver prints
  `close-time suite: reused the gate run (<gate>)`. The gate is the host's own definition of
  "enforced", and close happens once per spec. A host with a very slow gate gets a config knob,
  never a silent skip. (specs/20261101/05-the-gate-that-ran-the-suite-is-the-suite.md D3)
- **The close-time suite is skipped only by proof.** Under `policy.closeSuite: auto` the
  close-time whole-suite run is skipped when the close delta against the judged tree is
  overlay-only, no test file references a changed path (scope-reconcile's stem scan), and the
  judged tree's suite is green in the run cache; the driver prints `close-time suite: skipped —
  close delta is overlay-only and no test reads it (policy.closeSuite: auto)`. `always` runs it;
  this repo sets `always` because its tests read doctrine.
  (specs/20261103/12-one-suite-run-per-tree.md)
- **The close screen carries an advisory drift signal, never a gate.** After the hygiene
  listing and before the close commit, the driver prints one line naming the repo's current
  count of AC-pin `SHALL CONTINUE TO` bullets no test cites (`ac-drift.js --json` over
  `--root`; zero or `inapplicable` prints nothing) — informational only, it never touches the
  verdict, the ledger row, or mark acceptance. `/spec:doctor` check 17 is the same derivation's
  authoritative, browsable form; review's line only surfaces it at the moment new drift is
  created. (specs/20260907/01-mixed-pin-guard-and-drift-line.md D6)
- **Tests are classified at close, deleted only by a deliberate sweep.** The driver's close
  work runs `expire-tests.js --spec <spec>` after the authoritative verdict and before the
  ledger append: every test tagged with the closing spec's AC-IDs is classified *retirable*
  unless its call text cites a ledger escape class, its file names a script in the derived
  invariants set (`lib/invariants.js`: the transitive closure of scripts reachable from the
  host's config commands, hook commands and the pipeline's four entrypoints), a cited AC is a
  `SHALL CONTINUE TO` pin in a spec dated on or after 20260911, or a cited AC is unresolved.
  An AC-ID is unresolved when it belongs to a spec that is neither `done` nor `superseded`,
  when no spec defines it, or when a spec file under `specs/` cannot be read and the id falls
  under that file's path-derived prefix (`specs/YYYYMMDD/NN[a]-*.md` →
  `AC-YYYYMMDD-NN[a]-`) — the unreadable file is warned about on stderr and never changes the
  exit code. An AC-ID defined by more than one spec counts as closed only when every spec
  defining it is closed; the fail-safe holds through a number collision. Untagged tests are
  never touched. That close-time run is a **dry run in every mode the driver uses** — it
  reports what is retirable and which files that would empty, and writes nothing. The review
  row records `tests:{born,kept,retired}` from it (`retired` meaning *retirable*, not
  *deleted*) and the CLOSE step prints one 🧹 line when anything is retirable, stating that
  nothing is deleted at close and naming the sweep. With `policy.testExpiry: off` the close skips
  classification, prints `test expiry: off by policy` in place of the 🧹 line, and omits the
  row's `tests` key (specs/20261029/09-the-commands-read-the-policy-block.md D4). A failing or unparseable classification
  refuses the close. `--mark closed` re-runs the resolved host gate and then the host's whole
  suite over the committed close tree and refuses on either red; it applies no expiry, makes
  no commit of its own, and leaves `git rev-parse HEAD` untouched. The one path that deletes a
  test is `/spec:doctor` check 20's remedy — `node "$(spec-paths test-expiry)" --root .
  --all-done --apply` — run only after one question naming the count and the files.
- **A merge-back that deletes shipped work records it.** Before the first `merge-back.sh`
  subcommand, the driver derives the files the spec branch deleted that a done spec's File Plan
  created (`supersession-rows.js --merge`, creator rows only, tests layer excluded) and stores
  them in the sidecar; after the merge lands, `finishMerge` appends one `stage:"escape"` row per
  owning spec (`class: shipped-file-deleted`, `via: review`, `supersededBy` = the merged spec,
  `sha` = the landed merge commit) through `escape-row.js --append`, before the evidence
  promotion, so the row rides the ledger-record commit. A derivation failure prints one `⚠️`
  line and never fails the merge. The retired-spec sibling (`class: spec-superseded`) is
  written by `/git:commit` Step 3b when a commit flips a spec to `status: superseded`.
  (specs/20261101/11-a-direction-flip-leaves-a-row.md D2, D4)
