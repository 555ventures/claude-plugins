# Deviations — 06-mocks-provenance-ledger

- tests/mocks/mocks-ledger.test.js (test author): `spec/templates/mocks-ledger.md` (File Plan
  CREATE row, doctrine layer, no AC of its own) does not exist at test-authoring time. Rather
  than `fs.readFileSync` it (red for the wrong reason — a missing template file, not a mocks-ledger.js
  behavior gap), the test inlines the Contracts block's empty-template text verbatim as
  `EMPTY_TEMPLATE`. AC-20260902-06-5's assertions are unaffected: they exercise
  `appendAssumption`/`setStatus` against that literal text, not against the template file's
  on-disk existence. The scripts worker should keep `spec/templates/mocks-ledger.md`'s literal
  content byte-identical to the Contracts block so this inlined copy stays in sync.
- AC-20260902-06-9 split at build time (orchestrator, red-check RED_FINDINGS): its trailing
  "SHALL CONTINUE TO print the plugin root" clause made red-check classify the whole AC as a
  green pin, so tests/spec-paths.test.js was flagged broken-pin while genuinely red on the new
  shared-mocks key. The no-args regression clause is now its own pin, AC-20260902-06-10; AC-9
  keeps only the new behavior. No observable promise changed.
- D9's literal version-bump target (7.60.0) was already taken on main by a concurrent fix
  (`4486919`, disposition-pool unit fix) before this doctrine layer landed. Bumped to the next
  free minor, 7.61.0, per rules § Gotchas ("a spec Decision naming a literal version-bump
  target can be stale by build time"). The changelog entry names the ledger grammar and the
  exemption under the corrected number; no other content depends on the literal 7.60.0.
