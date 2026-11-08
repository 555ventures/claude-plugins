---
date: 2026-08-21
status: done
diff_base: 0496a4fe968b796d7448104ec84015e426b2f6f4
open_markers: 0
tier: standard           # additive spec-paths key follows 20260819/02 + 20260820/05 precedent; no critical-trigger file gets a behavioral edit; worst failure is a false exit 1 pausing a build
area: build-integrity
design: false
breaking: false
depends_on: ["specs/20260820/06-typed-evidence-manifest.md"]
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260821-01-1, AC-20260821-01-2, AC-20260821-01-3, AC-20260821-01-4, AC-20260821-01-5, AC-20260821-01-6, AC-20260821-01-7, AC-20260821-01-8, AC-20260821-01-9, AC-20260821-01-10, AC-20260821-01-11, AC-20260821-01-12, AC-20260821-01-13, AC-20260821-01-14]
---

# Mechanized red-check: `[pre-green:]` tags + `red-check.js` at build Phase 1

## Goal

Build's red-check — classify every tests-layer file's expected pre-image colour, execute
it, explain every mismatch — is hand-run from prose every build (build.md Phase 0 step 2 +
Phase 1), and its recurring failure class (acceptance criteria that cannot fail before
implementation) is recorded only in a thrice-amended Gotchas paragraph. This spec
mechanizes the seam: a closed-enum `[pre-green: <reason>]` AC tag declared at plan time, a
new `spec/scripts/red-check.js` executed at build Phase 1 that reconciles observed
per-file colour against the tag-derived expectation with exit codes, and a typed
`preGreen` count in ac-matrix's manifest row so the class rides into every review ledger
row and becomes fleet-countable. Done means: build.md's classification and red-check prose
are an invocation line, an unsanctioned green test file fails the build step naming its
AC-IDs, and the Gotchas paragraph is a one-line pointer at the mechanism.
