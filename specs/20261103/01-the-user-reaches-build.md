---
date: 2026-11-03
status: done
tier: standard
area: pipeline
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: d6fe8397a87b8f88345102f413fce145dafa1c22
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261103-01-1, AC-20261103-01-2, AC-20261103-01-3, AC-20261103-01-4, AC-20261103-01-5, AC-20261103-01-6, AC-20261103-01-7, AC-20261103-01-8]
---

# The user reaches build

## Goal

The apps this pipeline produces confuse the people they are for, because the user image — who
they are, the job they are doing, the situation they are in — is written once during genesis
and the wireframe and then never reaches plan, build or review; and because the gray wireframe
is read as the finished design. After this spec, every seed journey opens with a job story and
carries one off-path beat (first run or empty state), the roadmap brief and the spec carry those
stories forward, build workers and the reviewer read them, the reviewer walks each journey cold,
and the wireframe is declared binding for structure only. No new stage, no new script, no new
config key; one dead artifact (the UX research brief) is deleted.
