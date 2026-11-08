---
date: 2026-11-03
status: done
tier: critical
area: build-stage
breaking: false
depends_on: []
brief: n/a
spiked: 2026-11-03
open_markers: 0
diff_base: 8d873a5427234959e34ff1ee93082a2455d1dfe2
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261103-03-1, AC-20261103-03-2, AC-20261103-03-3, AC-20261103-03-4, AC-20261103-03-5, AC-20261103-03-6, AC-20261103-03-7, AC-20261103-03-8, AC-20261103-03-9, AC-20261103-03-10, AC-20261103-03-11]
---

# Workers never run git — the ban becomes a hook

## Goal

core § Worker Git Ban says implementation workers never run git, and today the only thing
enforcing it is the worker reading that sentence. This spec makes the ban a deterministic
PreToolUse hook on `Bash`: while the build driver has a worker-dispatching step open in a
working tree, any git invocation in that tree whose verb is not read-only is refused with a
remedy. The signal is a plugin-owned marker the driver keeps in sync with its own derived state
(never an environment variable, never agent identity). Done means: a planted marker plus
`git commit` is blocked in a test, the marker appears and disappears with the driver's states
in a test, and § Worker Git Ban points at the script as its enforcer.
