---
date: 2026-08-23
status: done
tier: critical           # touches spec/bin/spec-paths (key-set edit — critical trigger per pipeline
                         # rules § Risk Tiers) and creates the single invocation point every release
                         # verdict/ledger row flows through (record wraps verdict.js)
area: release-pipeline
design: false
breaking: false
depends_on: []
depended_on_by: []
# build_base pinned to a sha at build (2026-08-23): the branch was cut from main@fd1b15a, but
# spec/02-init-generation-script merged to main mid-build, touching three of this spec's File
# Plan files. main was merged in and the base repinned to that tip so review diffs this spec's
# work only. Never append an inline # comment to this key — the frontmatter reader does not
# strip them (§ Gotchas).
build_base: 7861ed3f6dbbbc8f1b0ada6f95607f987c9148ac
brief: 12
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260823-01-1, AC-20260823-01-2, AC-20260823-01-3, AC-20260823-01-4, AC-20260823-01-5, AC-20260823-01-6, AC-20260823-01-7, AC-20260823-01-8, AC-20260823-01-9, AC-20260823-01-10, AC-20260823-01-11, AC-20260823-01-12, AC-20260823-01-13, AC-20260823-01-14, AC-20260823-01-15, AC-20260823-01-16, AC-20260823-01-17, AC-20260823-01-18, AC-20260823-01-19, AC-20260823-01-20]
---

# Release legs: the milestone gate's deterministic checklist becomes a script

## Goal

`/spec:release` is today a ~10-step prose checklist a session performs by hand every
milestone — deploy, ready check, migrations check, CI polling, e2e, substrate rows, hand-printf'd
manifest JSON, and a verdict/ledger call the session must remember on every path including the
failure paths. Every deterministic step drifts per session, and the STOP-path ledger row is
exactly the step a bailing session forgets. This spec gives release what review got in
`review-legs.js`: one script, `spec/scripts/release-legs.js`, that runs the deterministic legs,
owns every manifest row append, and owns every `verdict.js --profile release` invocation —
while `release.md` shrinks to the judgment steps (grounding interview, journey walks, promote
confirm, report). It also retires the feedback-brief flush, whose plugin-side consumer
(`/intake`) died in v7 (JJ 2026-08-23). Done means: a release session issues three script
calls plus judgment, and a red leg or an abandoned run can no longer leave the ledger silent
by omission of a hand-performed step.
