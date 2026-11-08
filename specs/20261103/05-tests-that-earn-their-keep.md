---
date: 2026-11-03
status: done
tier: standard
area: test-expiry
breaking: false
depends_on: []
brief: n/a
spiked: 2026-11-03
open_markers: 0
diff_base: 4e19cf5b20dabd3019d013a40435546a0426ac27
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261103-05-1, AC-20261103-05-2, AC-20261103-05-3, AC-20261103-05-4, AC-20261103-05-5, AC-20261103-05-6, AC-20261103-05-7, AC-20261103-05-8]
---

# Tests that earn their keep

## Goal

The pipeline writes a permanent test for every acceptance criterion, including criteria about
doc and command prose, and its close-time expiry classifies a test by the text of its whole file.
The result on this repo: 1,569 test cases and 47.6k test lines against 29.8k script lines, a
retired-phrase assertion in 105 of 224 test files, and a `--all-done` sweep that would delete 77
real script tests while keeping 56 one-off prose checks. After this spec, a criterion that retires
wording is checked once at review and never becomes a test, new wording is a Decision review reads
rather than a criterion, and expiry judges each test case by what that case itself reaches, so the
one deliberate sweep deletes the prose one-offs and nothing that executes a pipeline script.
