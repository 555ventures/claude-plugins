---
date: 2026-11-07
status: done
area: tests
depends_on: []
brief: n/a
architecture: true
breaking: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261107-03-1, AC-20261107-03-2, AC-20261107-03-3, AC-20261107-03-4, AC-20261107-03-5, AC-20261107-03-6, AC-20261107-03-7, AC-20261107-03-8, AC-20261107-03-9]
---

# This repo's size check counts bytes and stops paying for deleted tests

## Goal

Fitting this repo's caps stops being cheaper by joining lines or deleting tests: bytes do not shrink when lines are joined, test files have no budget, and growth past a cap is a Decision the user locked.
