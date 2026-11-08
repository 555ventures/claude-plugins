---
date: 2026-11-03
status: done
tier: critical           # spec/templates/grounding-contract.md loses its `/spec:fanout --ask <key>` sentence (§ Risk Tiers: hash-stamped into every host) — one edit, contractHash restamped
area: fanout
breaking: true           # the user-facing flags --batch, --include-fixes, --override-serial, --ask and positional spec paths are refused after this lands (D1, asked: q39)
depends_on: [specs/20261103/06-the-fan-out-drains-the-queue.md, specs/20261103/08-queue-items-remember-their-origin.md, specs/20261103/09-an-executed-repro-answers-the-reject.md, specs/20261103/15-shared-files-land-by-rebase.md]
brief: n/a
open_markers: 0
diff_base: ee596648236673cd1457459a0b5f697aac2ea13c
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261103-14-1, AC-20261103-14-2, AC-20261103-14-3, AC-20261103-14-4, AC-20261103-14-5, AC-20261103-14-6, AC-20261103-14-7, AC-20261103-14-8, AC-20261103-14-9, AC-20261103-14-10, AC-20261103-14-11, AC-20261103-14-12, AC-20261103-14-13, AC-20261103-14-14, AC-20261103-14-15, AC-20261103-14-16]
---

# The fan-out has two modes

## Goal

`/spec:fanout` gets exactly two modes and nothing else. A bare run is AUTO: the derived batch in queue order,
every pending queued fix and red-CI row tabled as the serial fix group, one `📌` batch line, no question.
`/spec:fanout --pick` is SELF-PICK: one checkbox round (AskUserQuestion, `multiSelect`, at most four options per
question and four questions per call, so at most sixteen candidates) whose picks are routed through the same
boundary validation AUTO uses — self-surface, shared critical files, unmet dependencies, shared-brief holds —
never a bypass. The user-facing `--batch`, `--include-fixes`, `--override-serial`, `--ask`, `--lanes` and
positional spec paths are removed together with every line of code, state, fixture, test and prose that only
they reached. Done means: the driver accepts `--pick` and the marks and refuses every other flag with one usage
line; a grep for each removed flag and field finds nothing outside the plugin changelog; and the change deletes
more lines than it adds.
