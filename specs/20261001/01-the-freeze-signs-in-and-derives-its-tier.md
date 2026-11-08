---
date: 2026-10-01
status: done
build_base: design-retool
tier: critical
area: prototype
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-10-01
open_markers: 0
diff_base: 212712a68330e937f7acf3309a51fa15186bad9f
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261001-01-1, AC-20261001-01-2, AC-20261001-01-3, AC-20261001-01-4, AC-20261001-01-5, AC-20261001-01-6, AC-20261001-01-7, AC-20261001-01-8, AC-20261001-01-9, AC-20261001-01-10, AC-20261001-01-11, AC-20261001-01-12, AC-20261001-01-13, AC-20261001-01-14, AC-20261001-01-15, AC-20261001-01-16, AC-20261001-01-19, AC-20261001-01-20, AC-20261001-01-21, AC-20261001-01-17, AC-20261001-01-18]
---

# The freeze signs in and derives its tier

## Goal

A prototype freeze can capture routes that only render signed in: the host declares one saved
sign-in (`prototype.storageState`) and every capture — at the freeze and at the build's capture
gate — loads it, where today such a route refuses as a login redirect. The spec the freeze
generates stops being hardcoded `tier: standard`: its tier is derived from the paths the host's
pipeline rules § Risk Tiers names, matched over the generated File Plan, and a File Plan that
touches a named path is never written until the user has confirmed the lock. Done means a
signed-in route freezes with a saved sign-in, a stale or missing sign-in refuses by name, and a
generated spec touching a risk-listed path cannot reach `hardened` without an explicit tier.

Tier: **critical because** this spec edits `spec/templates/grounding-contract.md` (its hash is
stamped into every host config — host pipeline rules § Risk Tiers).
