---
date: 2026-09-28
status: done
build_base: design-retool
tier: critical
area: prototype
breaking: false
depends_on: []
depended_on_by: [specs/20260928/02-freeze-export-and-the-contract.md, specs/20260928/03-the-build-reads-the-freeze.md]
brief: 28
spiked: 2026-09-28
open_markers: 0
diff_base: 98db1571c97a5965e5e9cb65ee6a62ea9ef02bf0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260928-01-1, AC-20260928-01-2, AC-20260928-01-3, AC-20260928-01-4, AC-20260928-01-5, AC-20260928-01-6, AC-20260928-01-7, AC-20260928-01-8, AC-20260928-01-9, AC-20260928-01-10, AC-20260928-01-11]
---

# The prototype command and the pin overlay

## Goal

`/spec:prototype <brief>` opens a throwaway worktree on `proto/<brief stem>` from the host's
main branch, wires a dev-only pin overlay into the host app, and iterates with the user across
as many sessions as the brief needs: every round cold-starts from `design/prototypes/<stem>/`
on disk, JJ taps elements in the running app and leaves numbered pins that land in
`pins.json` through a local endpoint the driver runs only while a round is open, and the session
applies the changes on the prototype branch. The host declares how a prototype's database and
dev server come up; the plugin carries no Neon-specific code. Done means: on a fixture host the
driver opens the worktree, refuses to open twice, serves pins into the file with the contract's
shape, records rounds, and reaches `APPROVED` on the user's literal `approve` — the freeze itself
is spec 02.
