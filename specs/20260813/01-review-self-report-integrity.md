---
date: 2026-08-13
status: done
diff_base: 31487d8a365778b715d83314f8326721406d4f4a
open_markers: 0
risk: T3
area: review-integrity
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260813/02-durable-verification-qualifiers.md"]
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260813-01-1, AC-20260813-01-2, AC-20260813-01-3, AC-20260813-01-4, AC-20260813-01-5, AC-20260813-01-6, AC-20260813-01-7, AC-20260813-01-8]
---

# Review Self-Report Integrity

## Goal

The review stage's self-reports become trustworthy where three incident classes showed they are
not: a verifier can no longer kill a finding while its own evidence denies the kill (prompt
guard on the SANCTIONED path plus a mechanical post-verify audit of every `killed[]` entry); a
review-stage agent can no longer mutate shared substrates or leave scratch files that the close
commit ships; and two standing review holes close — the fix-delta full-gate contract becomes
visible at the site that implements fix-delta, and a `runtime.inert` declaration falsified by
the spec's own File Plan becomes a hard finding instead of a silently-off gate. Done = the six
open pins covering this surface run green and every prior review-integrity behavior still holds.
