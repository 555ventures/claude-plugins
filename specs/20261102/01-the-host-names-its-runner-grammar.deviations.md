# Deviations — 01-the-host-names-its-runner-grammar

- spec AC 13's pointer verb was `rewrites` over a CONTINUE-TO bullet (a lock defect per § Gotchas); the orchestrator amended it to `reuses` and the transient case stays a green pin.
- tests/review/trunk-declared.test.js: the AC-10 case (no trunk declared, base still `main`) is green on current code by design, being a CONTINUE-TO pin; the derived-default line is asserted only in the AC-19 case.
- review-legs.js suite leg: a `testCommand` carrying `{file}` has no bare whole-suite form, so the leg appends `{"unavailable":"file-placeholder"}` at exit 0 instead of running the unsubstituted command (the AC-4 fixture argv log forbids a bare run); the gate leg remains the whole-suite observation.
- Owner citation for the 20261102/01 spec folded into each touched script single Owner line (AC-20261024-04 forbids a second citation line or D-ids in comments).
