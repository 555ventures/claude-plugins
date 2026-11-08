---
date: 2026-09-11
status: done
build_base: main
tier: critical
area: spec-grammar
design: false
breaking: false
depends_on: [specs/20260911/02-tests-have-a-ceiling.md]
depended_on_by: [specs/20260911/03-tests-expire-at-close.md]
brief: n/a
spiked: 2026-09-11
open_markers: 0
diff_base: 7b1e4a177d0a739f4a3c649e6d375cbc60f44254
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260911-04-1, AC-20260911-04-2, AC-20260911-04-3, AC-20260911-04-4, AC-20260911-04-5, AC-20260911-04-6, AC-20260911-04-7, AC-20260911-04-8, AC-20260911-04-15, AC-20260911-04-9, AC-20260911-04-10, AC-20260911-04-11, AC-20260911-04-16, AC-20260911-04-12, AC-20260911-04-17, AC-20260911-04-18, AC-20260911-04-14, AC-20260911-04-13]
---

# Every criterion declares its test

## Goal

An acceptance criterion says what it does to the test suite it inherits: it **writes** a brand-new
test, it **rewrites** a named existing one, or it **reuses** one that already covers the behaviour.
The declaration is mandatory at plan lock, the reference resolves to exactly one pre-image test, and
the build's pre-image check verifies each declaration against the named test rather than against its
whole file — so a rewrite gutted into passing is caught, and a reuse that quietly widens a tolerance
is caught. A repo that has not told the pipeline how to run one named test keeps today's per-file
behaviour exactly. Done means: a spec cannot lock with an undeclared criterion, `spec-paths
count-tests --titles` hands an author every reference string in the repo, a gutted rewrite reddens
this repo's own build, and every arm degrades to today's result — with a warning, never a finding —
when the named test cannot be resolved or selected.
