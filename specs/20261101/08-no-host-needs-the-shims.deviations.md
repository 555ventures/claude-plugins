# Deviations — 08-no-host-needs-the-shims

- AC-20261101-08-17's pointer verb changed from `rewrites` to `reuses` at RED_FINDINGS
  (`gutted-rewrite`): its text is SHALL CONTINUE TO and removing the retired case leaves the named
  provenance case green on the pre-image, so `rewrites` was self-contradictory (§ Gotchas: fix the
  verb, never the measurement).
- AC-20261101-08-6's pointer changed from `reuses tests/genesis-gate.test.js :: AC-20260902-08-9`
  to `writes tests/genesis-gate.test.js` at RED_FINDINGS (`broken-reuse`): AC-5 `rewrites` the same
  named case red, so one case could not be both red (AC-5) and green (AC-6). AC-6's assertions stay
  in that case and hold on the pre-image; the file-level pointer keeps AC-6 covered.
- The orchestrator reworded AC-20261101-08-16's test title in tests/genesis/brief-no-shims.test.js
  ("a legacy brief key" in place of the dotted literal): the authored title spelled a D6 literal
  plainly and was the AC-15 sweep's only tests/ offender. No assertion changed.
- mocks-driver.js's not-confirmed remedy now reads "the client visits <link>" (was "opens"): D6's
  `client open` ban is a bare substring, so the live wording "client opens" matched it (§ Gotchas,
  tenth trigger). No test asserted the old wording; the remedy's meaning is unchanged.
