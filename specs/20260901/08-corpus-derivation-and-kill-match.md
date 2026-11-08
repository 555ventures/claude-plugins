---
date: 2026-09-01
status: done
build_base: main
tier: standard
area: feedback-loop
design: false
breaking: false
depends_on: [specs/20260901/07-escape-class-contract.md]
depended_on_by: []
brief: 19
open_markers: 0
diff_base: 90a60ab25d10cea09d5b3df97ad92be167aa6b0b
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260901-08-1, AC-20260901-08-2, AC-20260901-08-3, AC-20260901-08-4, AC-20260901-08-5, AC-20260901-08-6, AC-20260901-08-7, AC-20260901-08-8, AC-20260901-08-9, AC-20260901-08-10]
---

# Corpus derivation and the kill-match input — replay classes grown from escapes

## Goal

The replay corpus gains a derived section fed by the joined escape count sibling 07 produces:
the fleet reader names every class with two or more fleet recurrences and no corpus entry, the
corpus file grows a `## Derived classes` region whose first member is the one class already past
the bar, and `replay.js` refuses a class id the corpus does not carry while a script picks the
next class to replay (under-replayed derived classes first). Reviewer returns carry a location
on every killed claim, so future `killedMatch` derivations can match on file. Done means a
reviewer change (model, effort, legs) is measurable per escape-derived class, and an escape
recorded today can tell whether the review had already seen and dismissed it.
