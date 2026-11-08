---
date: 2026-08-25
status: done
diff_base: c15b711b87ba983a418da217cc489a11940894da
tier: critical           # edits the genesis-state-gate.sh hook (process boundary) and adds a spec-paths key
area: genesis
design: false
breaking: false
depends_on: [specs/20260825/03-genesis-currency-executed.md]
depended_on_by: []
brief: 10
open_markers: 0
spiked: 2026-08-25
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260825-04-1, AC-20260825-04-2, AC-20260825-04-3, AC-20260825-04-4, AC-20260825-04-5, AC-20260825-04-6, AC-20260825-04-7, AC-20260825-04-8, AC-20260825-04-9]
---

# The genesis driver and the one `/spec:genesis` command

## Goal

Genesis's architect stage becomes driver-stepped, the review-driver shape from brief 16: one
script, `genesis-driver.js`, derives the current state from `.claude/genesis/status.json` plus
the artifacts actually on disk, executes every deterministic step itself (status
initialization, the coverage-audit gate, the registry check per menu, the decision-record
closure check, the scaffold command, the zero-day gate, the roadmap closure check), and prints
only the one step that needs the session's judgment. `/spec:genesis-architect` is replaced by a
thin `/spec:genesis` command that loops on the driver; the explore and design commands are
untouched except for the predecessor's name (their fold into the driver is brief 10a). Every
accepted mark prints a **checkpoint** line — the state is saved, the session may `/clear` and
re-invoke — so a full genesis never has to fit one context window. Done means: the driver's
states run end-to-end against a synthetic host, the hook admits `/spec:genesis` as the entry
point, the old command file is gone, and the suite is green.
