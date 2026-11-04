---
name: feedback-pinned-sentence-hardwrap
description: A pinned doctrine phrase (reference or verbatim protocol token) must survive markdown line-wrap — keep it unwrapped, and expect tests to spell it with phrase() (whitespace runs become \s+); wording-of-a-rule pins no longer exist
metadata:
  type: feedback
  reviewed: 2026-11-03
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

**Corrected 2026-11-01 (specs/20261101/04, core.md § Doctrine Authoring):** the suite now pins
prose ONLY for two kinds (narrowed from three by specs/20261103/05): references (paths,
spec-paths keys, flags, headings, step labels, caps) and protocol tokens printed verbatim;
retired wording is an `[oracle: literals]` AC checked once at review, never a test. A pin on the
wording of a rule is not a test, and 51 such pins were deleted, so "keep this sentence verbatim,
it's a regex pin" should now only come up for those two kinds. New pins slice by heading with
`section(rel, startRe, endRe)` and spell literals with `phrase(literal, flags)` from
`tests/helpers.js`, which turns whitespace runs into `\s+`, so a wrap inside the phrase no longer
false-negatives the test. The wrap risk remains for old-style bare-word pins and for any token
printed verbatim: still put it on its own line or grep it as a single-line literal. Exemplar:
`tests/consistency/dead-stops.test.js`.
