---
date: 2026-09-18
status: done
tier: standard
area: mocks
design: false
breaking: true
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
build_base: main
diff_base: ae0336ba8118233bdbbd93335005f970a032dade
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260918-01-1, AC-20260918-01-2, AC-20260918-01-3, AC-20260918-01-5, AC-20260918-01-6]
---

# Mock contract v3

## Goal

`@555-ventures/mock-review` is going to contract 3 (`mock-review` repo,
`specs/20260918/01-04`): it retires `design/decisions.json` and `approval.theme`, removes the
screen-approve and theme controls from the served page in favour of a `mock-review approve --screen`
verb, and adds a `waive` verb so the package becomes the only program that writes a design document.
This spec is the plugin's half. It moves `spec/templates/mock/contract.json` to 3, replaces the
driver's own `approval.json` write with a call to the new verb, and corrects every doctrine sentence
that still tells a session to approve "on the served page" or to pick a theme there. Done means a
host on the v3 package runs the mocks and design stages with no contract-skew refusal, and no
JavaScript in this repo writes a design document.
