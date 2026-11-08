---
date: 2026-11-01
status: done
build_base: main
tier: critical
area: scripts
breaking: false
depends_on: [specs/20261101/09-the-five-writers-that-never-retried.md]
brief: n/a
open_markers: 0
diff_base: 2b86c28641dc1915d97dd2a9a68af9a80575310e
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261101-10-1, AC-20261101-10-2, AC-20261101-10-3, AC-20261101-10-4]
---

# One writer, and no copies left

## Goal

Thirteen gate scripts still carry their own copy of the synchronous stdout writer. Each copy
retries EAGAIN but rethrows EPIPE, so any of them piped to a reader that closes early (`| head`)
exits 1 with a stack trace instead of its own verdict — the exact defect the shared
`spec/scripts/lib/sync-write.js` was written to end, and which recurs for as long as copies exist.
Done means every script under `spec/scripts/` that writes a payload routes it through that one
module, byte-for-byte output and exit codes unchanged, and one standing test walks the directory
and fails the moment a new copy appears.
