---
date: 2026-11-03
status: done
tier: critical           # spec/scripts/spec-status.js — the --next/--lanes derivation changes shape internally (§ Risk Tiers: the sole "what's next" derivation; its --json surfaces are frozen); spec/bin/spec-paths gains a key
area: pipeline
breaking: false
depends_on: [specs/20261103/06-the-fan-out-drains-the-queue.md]
brief: n/a
open_markers: 0
diff_base: 3b00a591b1213d3db7a765ebd80274b705011352
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261103-10-1, AC-20261103-10-2, AC-20261103-10-3, AC-20261103-10-4, AC-20261103-10-5, AC-20261103-10-6, AC-20261103-10-7, AC-20261103-10-8, AC-20261103-10-9, AC-20261103-10-10, AC-20261103-10-11, AC-20261103-10-12, AC-20261103-10-13, AC-20261103-10-14, AC-20261103-10-15, AC-20261103-10-16, AC-20261103-10-17, AC-20261103-10-18]
---

# Two missing briefs are not the same brief

## Goal

A spec's `brief:` stamp becomes a two-variant value inside the scripts — `{ kind: 'briefed', num }` or
`{ kind: 'adhoc' }` — instead of a string that collapses to `null`, and one helper, `relateBriefs`,
is the only place two briefs are compared: it answers `same`, `different` or `unknown`, and every
`unknown` carries the reason the caller prints. A new deterministic lint, `variant-lint.js`, runs in
every suite run and fails on any `.brief` read in a boolean, coalescing or equality position under
`spec/scripts/**` outside the helper, so the defect class cannot return through review. The test
fixtures default to ad-hoc specs with briefed ones opt-in, and one standing smoke runs `--next --json`
and `--lanes --json` over a copy of this repo's own `specs/` tree in every suite run. Done means no
script anywhere asks "is the brief truthy" or "are these two briefs `===`", the external `--json`
shapes are byte-identical, and the fan-out report never claims an ad-hoc lane "waited on" a lane it
never waited on.
