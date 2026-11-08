---
date: 2026-11-01
status: done
build_base: main
tier: standard
area: doctrine-governance
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: aaab34b17bafff47a26a17fa860b07e6243aee6e
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261101-04-1, AC-20261101-04-2, AC-20261101-04-3, AC-20261101-04-4]
---

# The suite pins references, not wording

## Goal

The doctrine says behavior is pinned by behavioral tests, never by regexes over prose, while
the test agent is told to pin doctrine prose by regex, and the suite holds about 180 such pins.
This spec narrows the ban instead of dropping it: prose is pinned for three things only — the
references it must keep, the phrases it must no longer contain, and the protocol tokens an
executor prints verbatim — and a pin on the wording of a rule is not a test. Every surface that
states the rule says the same thing, the test agent and its exemplar follow it, two helpers make
pins reflow-safe, and the suite's existing wording pins are removed. Done means the rule has one
home, the agent prescribes it, and `npm test` carries no wording pin.
