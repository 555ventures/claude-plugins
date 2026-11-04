# Deviations — 13-a-change-is-sized-by-its-files

- spec/scripts/spec-review-driver.js: the `slow red at close` refusal is written straight to stderr + exit 2 instead of through `die()`, because AC-13-5 anchors `^slow red at close` at a line start and `die()` prefixes `spec-review-driver: `.
- spec/scripts/expire-tests.js: Contracts lists `--keep-on-red`, a flag the script never had; not added (no behaviour specified) — usage line carries `--apply [--no-gate]` only.
- Integration: A10 was false — `tests/review/review-driver-policy.test.js` (classify arm's 🧹 wording) and `tests/expiry/invariants.test.js` (spec 05 AC-7's kept-by-reach clause, whose subject D10 deletes) entered the File Plan via out-of-plan triage (D18, D19); the reach clause was removed from that case, its launcher-listing assertions stay. The reach-only "whole name" case in `tests/expiry/test-expiry.test.js` was deleted with the rule.
- Integration: spec 05 (20261101) AC-9's reuse pointed at a case D17 retires; the AC-13-3 case now also carries that criterion's ID in its title (it closes a green tree through the gate and suite).
- Integration: `review-driver.fixtures.js` `makeHost` gained a `config` option so AC-13-5's slow-tier key is committed in the base rather than reconciled as out-of-plan.
