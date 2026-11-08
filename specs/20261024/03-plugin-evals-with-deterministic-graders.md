---
date: 2026-10-24
status: done
build_base: main
tier: standard
area: evals
breaking: false
depends_on: []
brief: n/a
open_markers: 0
spiked: 2026-10-24
diff_base: 0a44191f4e57fed0f75d2b29ba6ccfa174ec18ca
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261024-03-1, AC-20261024-03-2, AC-20261024-03-3, AC-20261024-03-4, AC-20261024-03-5, AC-20261024-03-6, AC-20261024-03-7]
---

# Plugin evals with deterministic graders

## Goal

Nothing today proves that a Claude session picks up this plugin and follows its drivers'
printed steps; the 1,278 tests prove the scripts alone. Anthropic's `claude plugin eval`
(Claude Code 2.1.269+) runs a case against the plugin and against a no-plugin baseline and
reports the delta. This spec ships a small suite under `spec/evals/`: three cheap cases
(status, queue, doctor) with deterministic graders that gate nothing automatically but run
in one command, plus one heavy `/spec:run` case tagged for on-demand runs. Done means the
suite runs end to end on this machine and a test pins its shape.
