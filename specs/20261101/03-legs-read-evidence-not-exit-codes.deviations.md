# Deviations — 03-legs-read-evidence-not-exit-codes
- red-check `vacuous-green` detail reads "the runner exited <code> but executed no test per its output (testCountPattern <p>) — …" instead of D1's "its output shows no executed test"; AC-20261101-03-1 and the test require the substring `executed no test`.
- memory-sweep `matched` for a basename-rule hit is the basename (e.g. `ac-matrix.js`), not the full changed path the Contracts pseudo-code returns; AC-20260823-06-5 asserts the basename, and a verbatim-path hit still returns the full path.
