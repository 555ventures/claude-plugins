- [batch: spec/commands/build.md+review.md+scaffold-ledger.md] D5's build.md step 3 wrap
  necessarily makes step 3's text mention `suite-baseline`, which collides with the pre-existing
  regression pin `AC-20260814-03-12` in tests/suite-baseline/doctrine.test.js (asserts
  `doesNotMatch(step3, /suite-baseline/)`) — the colliding-pin class per this spec's own Gotchas
  entry. That test file is outside this batch's File Plan rows; applied D5 verbatim in
  build.md/review.md/scaffold-ledger.md and left the pin for the test-authoring batch to update
  in place (retag with a new AC-ID, per the Gotchas remedy) rather than touching a file outside
  this batch's assignment.
- [batch: other] D9's literal version target 6.81.0 was already long past at HEAD (6.87.0). Bumped
  to the next free version 6.88.0 per the host Gotchas' version-bump-discipline entry; the spec's
  number is a target, not a pin.
- [orchestrator] The D7 sentence landed in the gate-loop fragment split across two adjacent
  template-literal segments, so AC-20260816-01-11's contiguous-sentence regex could not see it.
  Joined into a single literal (no text change) and regenerated the workflows — mechanical, no
  Decision affected.
- [orchestrator] Out-of-plan spec-doc edit: appended an "Amended by specs/20260816/01 D5 + D11"
  backlink into specs/20260814/03-suite-baseline.md's D9 cell, per D11's recommendation and the
  amendment-backlink convention. Documentation-only; no behavior, no code, no test surface.
