---
date: 2026-11-07
status: done
area: run
depends_on: [specs/20261107/03-this-repos-size-check-counts-bytes.md]
brief: n/a
architecture: true
breaking: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261107-04-1, AC-20261107-04-2, AC-20261107-04-3, AC-20261107-04-4, AC-20261107-04-5, AC-20261107-04-6, AC-20261107-04-7, AC-20261107-04-8, AC-20261107-04-9, AC-20261107-04-10]
---

# The gate keeps every cited criterion

## Goal

A test that names a criterion can leave only with a retirement the user locked; every project with criterion-citing tests gets this at its next build, and a project without them is told, never blocked.
