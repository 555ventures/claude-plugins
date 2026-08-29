---
name: logtail-byte-window-falsification
description: Fixture + falsification recipe for pinning a "bound an excerpt by byte window, not line count" fix (genesis-driver.js logTail, 2026-08-26).
metadata:
  type: feedback
  reviewed: 2026-08-29
---

Pinning "an excerpt embedded in a script's own stdout must stay small even when the source file
is huge" needs two distinct fixture shapes, not one, because the bug (bounding by line count via
`text.split('\n').slice(-n)`) and its own half-fixed successor (prepending the truncation marker
BEFORE the line slice, so the slice can discard the marker) are different failure modes:

1. **One unbroken multi-megabyte line, no newlines** — realistic `\r`-driven progress output.
   `head -c 3000000 /dev/zero | tr '\0' 'x'; exit 1` (bash -c) gives an exact byte count with zero
   newlines; "the last N lines" becomes the whole file. Do NOT build this with
   `node -e "process.stdout.write(...)"` — that self-truncates at the 64 KiB async-pipe-flush
   ceiling before the bytes ever reach the driver under test (same class as
   [[../gate-scripts/console-log-exit-pipe-truncation.md]] if it exists, and this repo's own
   `writeOut()` header comment). Assert the OUTER `runNode`/`mark()` call (default maxBuffer) does
   NOT throw ENOBUFS and the driver's own captured stdout stays under a few tens of KB — that is
   the actual invariant, not "the log file is intact" (a separate, already-fixed guarantee one
   layer down).
2. **Many short lines past the byte window** — `yes '<32 a's>' | head -n 4000; exit 1` gives an
   exact, reproducible byte/line count (4000 × 33 = 132000). This is the shape that catches "marker
   attached, then sliced away by the line-count cut" — a single-giant-line fixture can't reach this
   bug because the byte-window read only ever contains ONE line, so the line slice never removes
   anything from it. Assert the truncated marker (naming the full log path) is still present in
   this case specifically.
3. **A no-op negative control** (short log fitting inside both the byte window and the line bound)
   is required alongside 1–2: a marker that never disappears means nothing when it does appear —
   assert its ABSENCE here.

**Falsifying via copy-and-swap of one function**: when the fix is one small function (`logTail`)
inside a large no-dependency script, don't reconstruct the whole pre-fix file from git history —
`cp` the CURRENT (already-fixed) script to a same-directory sibling (same directory matters: this
script resolves a companion script via `path.join(__dirname, 'registry-check.js')`, so a copy
elsewhere breaks it via MODULE_NOT_FOUND-equivalent), hand-edit ONLY the one function back to its
literal pre-fix body (quoted verbatim from the header comment's incident narrative), point the
test file's `SCRIPT` constant at the copy, run, confirm RED, then revert `SCRIPT` and `rm` the
copy. Confirm with `find . -iname '*<copy-name-fragment>*'` that nothing was left behind.

**Why:** dispatched 2026-08-26 as a review-fix-delta pin with no AC-ID and no F-id (the defect was
found against an earlier fix within the same review, one pass later) — per
[[review-finding-pins-no-ac]] this got a plain descriptive test name, no fabricated id token.

**How to apply:** any future "excerpt/log-tail/truncate-for-display" fix in a gate script: reach
for these three fixture shapes (single giant line / many-short-lines-past-window / fits-both-bounds)
rather than inventing new ones, and prefer the copy-one-function-back approach over reconstructing
history when the fix is small and the sibling-script resolution constraint applies.
