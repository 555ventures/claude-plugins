# Review close

The CLOSE phase of `/spec:review` writes into the repo — the spec's Canonical Delta lands in
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
