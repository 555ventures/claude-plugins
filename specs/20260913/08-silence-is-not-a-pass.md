---
date: 2026-09-13
status: done
build_base: main
tier: critical
area: release
design: false
breaking: true
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: ddf493d9d1da4f64463e25be07a93f50596fc093
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260913-08-1, AC-20260913-08-2, AC-20260913-08-3, AC-20260913-08-4, AC-20260913-08-5, AC-20260913-08-6, AC-20260913-08-7, AC-20260913-08-11, AC-20260913-08-8, AC-20260913-08-9, AC-20260913-08-10]
---

# Silence is not a pass

## Goal

Two products died green. UpWell closed 155 CLEAN specs and never moved one production row; its
release gate could not have said otherwise, because every leg that fails to measure (no CI
adapter, a commit CI never saw, a substrate manifest made entirely of declared exemptions, a
promotion the user declined) resolves to exit 0 and the release verdict reads CLEAN. This spec
makes an unmeasured leg derive `UNVERIFIED` on the release profile and stops the release flow
before promotion when one exists, and it makes genesis emit the first brief as a first-light
brief: the one real record through the deployed path, observed by a person, before any feature
work. Done means a release over a silent leg cannot print CLEAN, and a new roadmap cannot be
marked written without naming its first light.
