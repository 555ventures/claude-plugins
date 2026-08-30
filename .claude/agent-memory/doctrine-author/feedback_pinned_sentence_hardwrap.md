---
name: feedback-pinned-sentence-hardwrap
description: Verbatim-pinned doctrine sentences must be typed without a markdown line-wrap inside the pinned phrase — a wrap inserts a literal newline that breaks single-line regex pins
metadata:
  type: feedback
  reviewed: 2026-08-30
---

When a task says "keep this sentence verbatim — it's a regex pin," the danger isn't
paraphrasing, it's **hard-wrapping mid-phrase** when writing 80-100-col markdown prose. A pin
like `/Never hand-write the word/` fails if the file literally contains
`"Never\n  hand-write the word"` — the file is read as one string with real `\n` chars, and a
bare-word regex has no `\s`/multiline allowance.

**Why:** hit this directly on specs/20260820/07-review-driver.md build — wrote "Never\n
hand-write the word" across a wrapped bullet line and `tests/run-ledger.test.js`'s
`AC-20260820-07-13` pin went red immediately. This is also a named repo gotcha
(`.claude/rules/spec-pipeline.md` § Gotchas, the "contiguous sentence… split across two
physical lines" entry) — not a one-off, a recurring class in this repo.

**How to apply:** when a prompt hands you an exact pinned phrase to preserve, either (a) put
it on its own line so no wrap can land inside it, or (b) after writing, grep the phrase as a
single-line literal against the file to confirm it survived word-wrap before calling the task
done. Always re-run the pinned test after any prose rewrite that touches a load-bearing
sentence, even when the diff "obviously" kept the words intact.
