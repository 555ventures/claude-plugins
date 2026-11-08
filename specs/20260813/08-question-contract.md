---
date: 2026-08-13
status: done
diff_base: dd4d47e3851225e267aae997293800c28ed81da2
open_markers: 0
risk: T3
area: question-surface
design: false
breaking: false
depends_on: ["specs/20260813/07-command-report-conformance.md"]
depended_on_by: ["specs/20260813/09-model-placement-mechanics.md"]
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260813-08-1, AC-20260813-08-2, AC-20260813-08-3, AC-20260813-08-4, AC-20260813-08-5, AC-20260813-08-6, AC-20260813-08-7, AC-20260813-08-8]
---

# Question contract — workflow schemas carry consequence + recommendation; doctrine stops fighting the hook

## Goal

The question-style hook (PreToolUse on AskUserQuestion, already wired in hooks.json) enforces
consequence-bearing options and reasoned recommendations at ask time — but the workflow
schemas that *manufacture* fork questions lack those fields, the doctrine sites that build
questions from those payloads never consume them, and four doctrine sites instruct the
opposite ("recommend nothing", "never batch-approve", "neutrally worded"). This spec makes
the data match the contract end to end: fork payloads are born with consequence and
recommendation-reason fields, every consumer renders them into the question it builds, and
every doctrine line that fights the hook is corrected in place. Done means: a fork surfaced
by any workflow reaches AskUserQuestion with everything the hook demands already in hand —
produced once, consumed where the question is built — and no command teaches the style the
hook blocks.
