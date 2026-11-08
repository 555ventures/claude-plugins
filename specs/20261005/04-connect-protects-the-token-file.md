---
date: 2026-10-05
status: done
build_base: design-retool
tier: standard
area: design
breaking: false
depends_on: [specs/20261005/02-connect-runs-first.md]
brief: n/a
spiked: 2026-10-05
open_markers: 0
diff_base: fe5bf745e5a39d14326c7eedb641fdb68555bf81
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261005-04-1, AC-20261005-04-2, AC-20261005-04-3, AC-20261005-04-4, AC-20261005-04-5, AC-20261005-04-6]
---

# Connect protects the token file itself

## Goal

`/spec:connect` stores the service token in `.claude/settings.local.json` and refuses to run
while git does not ignore that file. A brand-new folder has no `.gitignore` line and is often
not a git repository yet, so the command that is meant to run first stops and asks for hand
steps. This spec makes connect add the ignore line itself and go on, in a git repository and in
a plain folder. Done means: one command connects an empty folder with no hand step; the token
file is still never stored where git already tracks it; and connect never runs `git init`.

This reverses criterion 9 of specs/20261005/01-connect-wires-a-project-to-the-review-service.md
(an unlisted file is refused) and criterion 5 of specs/20261005/02-connect-runs-first.md (a
folder that is not a git repository is refused). It builds after spec 02 has merged.
