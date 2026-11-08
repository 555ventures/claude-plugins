---
date: 2026-11-05
status: done
area: status
depends_on: []
brief: n/a
architecture: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261105-01-1, AC-20261105-01-2, AC-20261105-01-3, AC-20261105-01-4, AC-20261105-01-5, AC-20261105-01-6, AC-20261105-01-7, AC-20261105-01-8, AC-20261105-01-9, AC-20261105-01-10, AC-20261105-01-11, AC-20261105-01-12]
---

# The dashboard returns: v7's `/spec:status` screen on v8's state

## Goal

Running `/spec:status` on a v8 repo prints the screen JJ knew from v7: one glance shows which briefs are done, which one is being built and how far along it is, which questions wait in the queue, what to run next and whether it can fan out. `--all` adds what is not startable yet and the hygiene list; `NN` answers "can I plan this brief" with an exit code. On niko-hub the roadmap shows 02a at the same `n/m` v7 shows and the same six `qNN` rows.
