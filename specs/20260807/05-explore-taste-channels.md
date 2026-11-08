---
date: 2026-08-07
status: done
open_markers: 0
risk: T2
area: genesis-explore
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260807-05-1, AC-20260807-05-2, AC-20260807-05-3, AC-20260807-05-4, AC-20260807-05-5, AC-20260807-05-6, AC-20260807-05-7]
---

# Explore taste channels — tokens-as-code authorship, positions template, unconditional Round 0 critique

## Goal

Fix the amateur-design failure mode in `/spec:genesis-explore`: Fable's taste currently
reaches Sonnet builders only through a 3-ingredient prose position brief, and the one
high-bandwidth channel (critique of renders) is conditional on browser availability in the
round where the look is born. After this spec: the session authors each position's starter
`tokens.css` (taste travels as code), position briefs follow a template with mandatory
execution-level fields, and explore requires a render capability up front — Round 0 tiles are
always rendered, screenshotted, and session-critiqued before the user sees them.
