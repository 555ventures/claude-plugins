---
date: 2026-08-23
status: done
open_markers: 0
tier: standard
area: bootstrap
design: false
breaking: false
depends_on: ["specs/20260822/02-init-generation-script.md"]
depended_on_by: []
brief: n/a
build_base: main
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260823-02-1, AC-20260823-02-2, AC-20260823-02-3, AC-20260823-02-4, AC-20260823-02-5, AC-20260823-02-6, AC-20260823-02-7, AC-20260823-02-8]
---

# Init-gen input hardening — the four defect sites waived at review rv_e83659d49386

## Goal

Review rv_e83659d49386 (2026-08-23) closed specs/20260822/02 CLEAN with four executed defect
sites in `spec/scripts/init-gen.js` waived under the two-iteration fix cap, owned by this
spec: a string in the profile's `settings.extraAllow`/`extraDeny` spreads per character into
the host's permission allow list at exit 0; a non-iterable there, or a primitive at either of
`validateProfile`'s two `in`-operator sites, dies as a bare TypeError at Node's implicit
exit 1 (colliding with the documented "manifest-check red"); the hoisted `mergeSettings` call
sits one line above the exit-4 error boundary that round added; and the unreadable-settings
remedy tells a directory-shaped `settings.json` operator to `chmod` a file. Done = every
malformed input lands on the documented exit 2 with a matched remedy, the merge computation
sits inside the boundary, and the three behaviors the parent review pinned still hold. No
exit-code alphabet change.
