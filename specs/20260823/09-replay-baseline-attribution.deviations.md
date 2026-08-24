# Deviations — specs/20260823/09-replay-baseline-attribution.md

- D8's literal 7.29.0 was already at HEAD, bumped to 7.30.0 per the repo's version-race gotcha.
- `diff_base` corrected at build close from `71dad74` to `6cf9ce1`. A concurrent session in this
  repo committed `6cf9ce1` (`fix(merge-back): cleanup deletes a squash-merged branch instead of
  dying on it`, touching `spec/scripts/merge-back.sh` + `tests/merge-back.test.js`) between this
  build's Phase 0 base capture and its own commit, making the recorded sha a stale pre-image that
  would have diffed the sibling's unrelated commit into this spec's review panel. Corrected to the
  true pre-image per the pipeline rules § Gotchas entry for this class (specs/20260816/03
  precedent); review inherits the corrected value with no special handling.
