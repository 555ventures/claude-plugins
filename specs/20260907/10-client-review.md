---
date: 2026-09-09
status: done
build_base: main
tier: standard
area: mocks-driver
design: false
breaking: false
depends_on: [specs/20260907/08-walk-critic.md]
depended_on_by: [specs/20260907/11-client-view.md]
brief: 22a
spiked: 2026-09-09
open_markers: 0
diff_base: 0bdf532e547c4a1a67f1001c634aae7248fde9ab
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260907-10-1, AC-20260907-10-2, AC-20260907-10-3, AC-20260907-10-4, AC-20260907-10-5, AC-20260907-10-6, AC-20260907-10-7, AC-20260907-10-8, AC-20260907-10-9, AC-20260907-10-10, AC-20260907-10-11, AC-20260907-10-12, AC-20260907-10-13, AC-20260907-10-14, AC-20260907-10-15, AC-20260907-10-16, AC-20260907-10-17, AC-20260907-10-18, AC-20260907-10-19, AC-20260907-10-20, AC-20260907-10-21, AC-20260907-10-22]
---

# CLIENT replaces SIGNOFF: a client note captures its screen when raised, closes only on a re-capture that differs, and a silent client is released by a dated waiver

## Goal

`/spec:mocks`'s last human gate becomes the **CLIENT** state (ADR-0012): the served journey
pages, exposed by the user, where a client answers product questions and leaves notes. A note's
origin (`walk | client | session`) is decided by the route it arrived on, never by the typed
name; a client's mock-scope note captures its screen at raise, a fix is recorded only when the
re-captured screen differs, the session can never resolve a client note, and a client who goes
silent for seven days is released only by a dated waiver that prints at approval. Done means
the driver derives `CLIENT` where it derived `SIGNOFF`, the client route exists and enforces
every rule above on the notes file, and `--mark approved` prints the waived count and reasons.
The served client *view* (whole-project entry, product-only filtering) is
specs/20260907/11-client-view.md — the second half of the same brief, not deferrable, locked
after one real client is observed on the existing review page.
