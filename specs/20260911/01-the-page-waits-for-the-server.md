---
date: 2026-09-11
status: done
build_base: main
tier: standard
area: design-atlas
design: false
breaking: false
depends_on: [specs/20260910/03-client-journey-player.md, specs/20260910/04-theme-before-the-client-walk.md]
depended_on_by: []
brief: n/a
open_markers: 0
spiked: 2026-09-11
diff_base: 427d4b746c3a1dde7ca4eee2c5a660ba5f79cb33
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260911-01-1, AC-20260911-01-2, AC-20260911-01-3, AC-20260911-01-4, AC-20260911-01-5, AC-20260911-01-6, AC-20260911-01-7, AC-20260911-01-8, AC-20260911-01-9, AC-20260911-01-10, AC-20260911-01-11]
---

# The client player speaks English and waits for the server

## Goal

Two defects escaped `specs/20260910/03-client-journey-player.md` (done, review CLEAN, neither
defect among its five killed claims). The client pages declare `<html lang="en">` while rendering
the Japanese string table; and the player never checks whether any of its saves worked — it hides a
guess, drops the open count, clears a typed note and reports nothing on a sign-off, all before the
server has answered. A `no` with an empty reason is refused server-side, but the browser never sees
the refusal, so the count still reaches zero, sign-off unlocks, and `POST /client/__walk/confirm`
validates only the journey name: a journey is recorded client-confirmed with a question still open.

The first defect is fixed by deletion, not by plumbing. The player's own chrome becomes
English-only — the two-language `STRINGS` table and the `lang` role spec 03 D2 introduced are
retired — so the declared language and the rendered language can no longer disagree. The language
of the *mocks* is untouched and stays whatever the client's product is; only the player's own
buttons and labels are in question here.

Done means: no Japanese survives in the player's chrome; every save on the page acts on the
server's answer and says so when it fails; and the server refuses a sign-off while a guess is
unanswered, so the record cannot be wrong even from a stale tab.
