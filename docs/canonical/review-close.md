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
- **Cost is accepted by contract.** One full `gateCommand` run per close attempt. The gate is
  the host's own definition of "enforced", and close happens once per spec. A host with a very
  slow gate gets a config knob, never a silent skip.
- **The close screen carries an advisory drift signal, never a gate.** After the hygiene
  listing and before the close commit, the driver prints one line naming the repo's current
  count of AC-pin `SHALL CONTINUE TO` bullets no test cites (`ac-drift.js --json` over
  `--root`; zero or `inapplicable` prints nothing) — informational only, it never touches the
  verdict, the ledger row, or mark acceptance. `/spec:doctor` check 17 is the same derivation's
  authoritative, browsable form; review's line only surfaces it at the moment new drift is
  created. (specs/20260907/01-mixed-pin-guard-and-drift-line.md D6)
- **Tests expire at close.** The driver's close work runs `expire-tests.js --spec <spec> --apply`
  after the authoritative verdict and before the ledger append: every test tagged with the
  closing spec's AC-IDs is deleted unless its call text cites a ledger escape class, its file
  names a script in the derived invariants set (`lib/invariants.js`: the transitive closure of
  scripts reachable from the host's config commands, hook commands and the pipeline's four
  entrypoints), a cited AC is a `SHALL CONTINUE TO` pin in a spec dated on or after 20260911, or
  a cited AC belongs to a spec that is not done. An AC-ID defined by more than one spec counts as
  done only when every spec defining it is done — the fail-safe holds through a number collision.
  Untagged tests are never touched. The review row records `tests:{born,kept,retired}`; the CLOSE
  step prints one 🧹 line when anything was retired; the deletions ride the close commit that
  `--mark closed`'s gate re-run certifies. A failing expiry refuses the close. `/spec:doctor`
  check 20 runs the same rule as a dry run over every done spec and applies it only after one
  question naming what it will delete.
