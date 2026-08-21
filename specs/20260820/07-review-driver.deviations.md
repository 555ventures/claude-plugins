# Deviations — specs/20260820/07-review-driver.md

- plugin.json bumped to 7.14.0, not the spec's literal 7.13.0 target: that version was already taken at HEAD (known [host] gotcha — concurrent sessions race the same semver; the spec's number is a target, not a pin).
