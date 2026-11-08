---
date: 2026-11-08
status: done
area: run
depends_on: [specs/20261107/01-a-done-spec-is-a-stub.md]
brief: n/a
architecture: false
breaking: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261108-03-1, AC-20261108-03-2, AC-20261108-03-3, AC-20261108-03-4, AC-20261108-03-5, AC-20261108-03-6, AC-20261108-03-7]
---

# An unmet Decision routes to amend, and an amended spec resumes its build

## Goal

A builder that cannot keep a Decision sends the user to the spec first, not to a second Opus round. Picking amend leaves the build where it is; once `/spec:plan` re-locks the spec, the same run (solo or fanout lane) rebases, re-reads the spec and goes through GATE and REVIEW to land, with no hand-moving. The code that set a spec to draft and ended the run goes.
