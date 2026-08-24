# Deviations — specs/20260824/06-review-range-identity.md

- The Contracts "verdict.js flag matrix" table's quoted message for "either flag with `--profile
  release`" reads `verdict.js: --base-sha/--head-sha are not valid with --profile release — a
  release row describes a milestone, not a diff`, which does not itself contain the phrase `git
  rev-parse --verify`. D2 states a blanket rule that ALL --base-sha/--head-sha refusals (invalid
  hex, mismatched pair, or either flag on --profile release) name the remedy `git rev-parse
  --verify <ref>^{commit}`, and AC-20260824-06-2's test (`tests/review/verdict.test.js`) asserts
  `stderr` matches `/git rev-parse --verify/` on all five listed cases, including this one. The
  shipped message keeps the table's text verbatim as a prefix and appends
  `(git rev-parse --verify <ref>^{commit})` in parentheses, satisfying both the verbatim-string
  instruction and D2/AC-2's blanket naming requirement — the two could not otherwise be
  simultaneously satisfied for this one row.
