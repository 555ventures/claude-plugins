---
date: 2026-09-02
status: done
tier: critical
area: gate-integrity
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260902/02-plugin-code-sweep.md", "specs/20260902/03-plugin-prose-sweep.md", "specs/20260902/04-host-generators-owner-citations.md"]
brief: 21
open_markers: 0
spiked: 2026-09-02
build_base: main
diff_base: 1f6a7ed5ab1807d241a15374be383934d493a43a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260902-01-1, AC-20260902-01-2, AC-20260902-01-3, AC-20260902-01-4, AC-20260902-01-5, AC-20260902-01-6, AC-20260902-01-7, AC-20260902-01-8, AC-20260902-01-9, AC-20260902-01-10, AC-20260902-01-11, AC-20260902-01-12, AC-20260902-01-13]
---

# Comment narration gate: owner citations, never history

## Goal

A comment or rule note cites an owner id in one line and never narrates dates, people,
hosts, versions, or prior behavior. This spec makes that rule un-violable in this repo: a
deterministic scanner (`comment-narration.js`) classifies whole-line comments and markdown
prose against six narration classes, ratchets against a tracked per-file baseline so the
existing debt cannot grow while siblings 02/03 sweep it to zero, proves a sweep touched no
executable line (`--code-identical`), and scans a host's generated rules layer for
`/spec:doctor` (`--rules-mode`). The five convention homes that currently mandate "why (dated
incident)" in every header move together to the new rule. Done means: the standing test is
green against the tracked baseline, every class fires on a synthetic tree, the oracle
distinguishes comment-only edits from code edits, and `/spec:doctor` invokes the rules-mode
scan as its numbered check 16.
