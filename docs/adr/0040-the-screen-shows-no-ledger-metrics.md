# 0040. The screen shows no ledger metrics

- Status: accepted
- Date: 2026-11-05

## Context

ADR-0039 D6 gave `/spec:status` two render-only lines derived from the run ledger (suite runs
per spec, test:production lines) and the footer's "N done since last release" clause. They
landed in v7 two days before the `spec-v7-final` tag and were never the everyday screen. v8 has
no ledger: `migrate.js` archives `.claude/spec-runs.jsonl` and nothing writes a row. Spec
specs/20261105/03-the-screen-knows-its-items.md ports v7's dashboard byte-for-byte and has to
say what happens to those lines.

## Options considered

- **Keep them, fed by a new committed ledger** — a ledger row per run end, escape rows from
  `/git:commit`, a doctor check. Planned as "spec 2" and dropped by JJ as over-engineering.
- **Print them with empty values** (`n/a (0 specs)`) — a line that can never say anything.
- **Absent** — the screen never prints a ledger-derived line; chosen.

## Decision

`/spec:status` never shows ledger-derived metrics: no `📈` line and no "done since last
release" / "never released" footer clause, whatever files the host carries. ADR-0039 D6 is
superseded by this ADR; its other decisions stand. The screen's data is specs, briefs, the
queue, run sidecars and `doctor.check`.

## Consequences

- The v7 port's golden oracle drops exactly those lines from v7's output and nothing else.
- A future "metric before guard" baseline needs its own ADR and its own data source; nothing
  in the plugin accrues one today.
