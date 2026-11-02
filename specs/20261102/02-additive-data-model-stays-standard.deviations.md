# Deviations — 02-additive-data-model-stays-standard

- AC-20261102-02-5 pointer names a case titled "AC-20261029-05-7: core.md § Tiers states" in structural-triggers-doctrine.test.js, but no such case existed; added it as a new case carrying that title prefix plus AC-20261102-02-5 (fails on the untouched doctrine pre-image).
- decision-lint.js: carve-out also requires the contradiction predicate to find nothing (Behavior step 3 says only "both lines present"); AC-3 second spec (both lines + `drop column`) demands data-model-requires-critical on standard, so a contradicted declaration never suppresses the tier demand.
