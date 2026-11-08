---
date: 2026-11-01
status: done
build_base: main
tier: standard
area: scripts
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: 65495095120e52ef2e781ac6dd61ced0a07cf284
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261101-09-1, AC-20261101-09-2]
---

# The five writers that never retried

## Goal

Five gate scripts (`port-check`, `spec-number-check`, `workspace-scan`, `design-contract-check`,
`catalog-inventory`) still carry their own copy of the synchronous stdout writer, and these five
copies retry on nothing: a momentarily full non-blocking pipe (EAGAIN) throws, and a reader that
closed early (EPIPE, `script | head`) crashes the script with exit 1 and a stack trace, masking its
real verdict. The writer already lives once in `spec/scripts/lib/sync-write.js` with both cases
handled. Done means each of the five routes every byte through that module, keeps its own framing
and exit codes byte-for-byte, and a closed reader leaves its exit code untouched.
