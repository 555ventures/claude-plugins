# Deviations — 01-the-legs-seal-the-manifest

- The drift refusal's copy-and-re-run line prints `node "$(spec-paths <leg script>)" … --manifest <scratch>`
  rather than the Contracts block's literal `spec-paths ac-matrix`: a literal `spec-paths ac-matrix` in
  the driver reads as an undeclared invocation to `tests/consistency/entrypoints.test.js`
  (spec 20260820/04 AC 6), and the refusal fires for any leg, not only ac-matrix. AC-7's asserted tokens are unchanged.
