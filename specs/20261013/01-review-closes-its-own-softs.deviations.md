# Deviations — 01-review-closes-its-own-softs

- spec-review-driver.js: the startup `observeDeviations()` call no longer persists the sidecar when the mark is `closed` (new `persist` param); `handleClosed()` saves it right after the D4 unswept-soft refusal. Forced by AC-20261013-01-4's byte-identical review-state.json requirement when a deviations sidecar already exists on disk.
- spec-review-driver.js: the unknown-mark error text is unchanged and does not list `soft-swept`; an existing test pins that exact list. The mark is documented in the header CONTRACT instead.
