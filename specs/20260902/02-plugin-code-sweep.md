---
date: 2026-09-02
status: done
tier: standard
area: gate-integrity
design: false
breaking: false
depends_on: ["specs/20260902/01-comment-narration-gate.md"]
depended_on_by: ["specs/20260902/03-plugin-prose-sweep.md"]
brief: 21
open_markers: 0
build_base: main
diff_base: d63af56912c35f44c6c1763055185cf3456e2c2f
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260902-02-1, AC-20260902-02-2]
---

# Plugin code sweep: comments cite owners, code stays byte-identical

## Goal

Every whole-line comment under `spec/scripts`, `spec/bin`, `scripts`, and `tests` states the
current invariant plus one owner id and nothing else. The sweep is mechanical — driven by
the gate's own finding list — and safe only because `comment-narration.js --code-identical`
proves no executable line moved. Done means: the plugin scan reports zero findings for every
code-group file with no code path left in the baseline; the oracle reports every code file
identical to the pre-sweep base; the full suite is green; the four comments that describe
deleted machinery are corrected.
