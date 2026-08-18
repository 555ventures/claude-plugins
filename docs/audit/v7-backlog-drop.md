# v7 backlog drop — 2026-08-17

The v7.0.0 ground-up redesign (JJ-approved 2026-08-17) retired the intake ledger, the
sanctioned-red baseline, and the failing-pins-as-TODO convention. Every open intake row was
dropped with the backlog. Under the v7 incident policy, a dropped class earns a deterministic
guard only on its third recurrence — never prose. This file records the reopen conditions for
the dropped items whose blast radius reaches hosts; everything else reopens only if it recurs.

## Host-blast-radius reopen conditions

- **PRAX-20260721-04 (stale-cache green):** reopen if any host again observes a gate leg
  reporting green from a runner-level or tool-level cache over red files (or red from a stale
  summary over green files). Fix shape on reopen: a red activation probe per gate leg at
  init/doctor — inject a known-red input, require non-zero exit — plus per-tool cache-defeat
  guidance.
- **JJ-20260817-02 (gate-wrap quoting):** reopen if any host repo path containing a space (or
  other shell-significant character) breaks a gate invocation, or if a command file again
  embeds an unresolved `$(spec-paths …)` substitution in a command string handed to an agent.
  Fix shape on reopen: quote every interpolated path at the resolution site and hand agents
  only pre-resolved absolute paths.

## Dropped open rows (2026-08-17, no reopen condition recorded — recurrence is the trigger)

PRAX-20260717-02 (worker CWD in nested worktrees), HEARWELL-20260721-02 (enforce hash stamp
order), PRAX-20260721-02 (codegen seam orchestrator step — the workflow it patched is retired),
PRAX-20260721-03 (parity-check plane grammar — parity-check itself is retired),
PRAX-20260801-03 (fidelity element semantics — deferred to the v7.1 design thinning),
JJ-20260814-02 (workflow runId provenance — workflows retired), JJ-20260816-02 (tdd waiver
provenance — the waiver lever is redesigned in v7 build), JJ-20260817-01 (ac-matrix duplicate
AC-ID adjudication), JJ-20260817-03 (verdict observed-string anomaly), JJ-20260817-04
(red-check sentinel path keying — the probe contract is rewritten in v7 build),
PRAX-20260817-01 (ac-matrix prefix-collision skip attribution).

The five unbuilt specs under `specs/20260817/` (01–05) were superseded by this redesign; their
intake rows are covered by the list above.
