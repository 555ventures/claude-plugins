---
date: 2026-08-22
status: done
open_markers: 0
tier: standard           # additive spec-paths key follows 20260819/02 + 20260820/05 + 20260821/01 precedent; scope-reconcile.js (critical-named) gets one additive read-only flag, no behavioral edit to existing modes (pinned by AC-12); init runs only at bootstrap — worst failure is a broken bootstrap in a fresh host, recoverable by re-run
area: bootstrap
design: false
breaking: false
depends_on: ["specs/20260821/03-cross-spec-skip-mapping.md"]
depended_on_by: []
brief: 11
# build_base corrected at build close from the branch name `main`: a sibling session landed
# 20260822/01 (b4cf091) on main after this worktree branched, so the moving-branch base diffed
# that spec into this one. Inline `#` comments are NOT stripped from frontmatter values.
build_base: 909bd30a126fbe9fab7632909fcc0b36fabeacdf
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260822-02-1, AC-20260822-02-2, AC-20260822-02-3, AC-20260822-02-4, AC-20260822-02-5, AC-20260822-02-6, AC-20260822-02-7, AC-20260822-02-8, AC-20260822-02-9, AC-20260822-02-10, AC-20260822-02-11, AC-20260822-02-12, AC-20260822-02-13, AC-20260822-02-14, AC-20260822-02-15, AC-20260822-02-16, AC-20260822-02-17, AC-20260822-02-18, AC-20260822-02-19]
---

# Init generation script — the bootstrap's deterministic file generation becomes code

## Goal

`init.md` (604 lines) is the last big English program standing after v7: most of it is
deterministic file generation — config, rules, agents, skills, settings allowlist, manifest,
gitignore/gitattributes mechanics — described as prose for a model to re-perform each
bootstrap. This spec moves all of it into one script, `spec/scripts/init-gen.js` (the
`review-legs.js` inversion applied to init): the session profiles the repo, interviews the
user, authors judgment content as one structured profile, and invokes the script, which is
the sole writer of every grounding-layer deliverable and enforces the manifest-check→stamp
ordering in code. Init also gains the three probes brief 11 folds in: `frontend-design`
installed-check (ADR-0001), the `testCommand` no-match probe, and the at-risk-leg
applicability probe. Done = the generated tree passes `manifest-check.sh` executed (not
asserted) in tests, and `init.md` shrinks to profiling + interview + probe + one invocation.
