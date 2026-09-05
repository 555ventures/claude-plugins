---
name: sweepretiredliteral-new-sweep-must-waive-own-siblings
description: adding a new sweepRetiredLiteral() call for a freshly-retired command name must waive ONLY the test files that must contain the literal to do their job (asserting its absence, a sibling sweep's own test file); every other hit — including an out-of-batch file's stale comment — gets edited in place, never waived, and this memory file must describe the retired name generically, never spell it
metadata:
  type: feedback
  reviewed: 2026-09-04
---

`tests/consistency/genesis-doctrine.test.js`'s `sweepRetiredLiteral(literal, {citations,
waivedPaths, waivedPrefixes})` helper walks the WHOLE tree (`walk(ROOT)` skips only `.git` and
`node_modules`) looking for the bare literal — an untracked-but-not-gitignored file, including
one under `.claude/agent-memory/`, is NOT exempt. It is a DIFFERENT sweep family from
`tests/tracked-text-purity.test.js`/`tests/consistency/dependency-free.test.js` (see
[[self-matching-literal-pin-fragment-idiom]]) — those have no waiver mechanism at all, so
fragment-splitting the literal in source is the only fix there. `sweepRetiredLiteral` DOES have
one (`waivedPaths`), and using it is the established, correct fix for a file that legitimately
needs the literal — never fragment-split against this sweep family, and never widen
`waivedPrefixes` to blind a whole directory (e.g. an agent-memory folder) just because one file
in it happens to discuss the retired name.

**This note itself reddened the sweep once by spelling the literal in its own prose** (a memory
file, like any other non-gitignored file, is "the tree the sweep walks"). Refer to a retired
command by the spec that retired it (e.g. "a sibling spec's retired command", "the spec
20260827/03 retirement") rather than spelling the command name — even inside backticks or a
quoted example. The lesson survives without the literal.

**Why a new sweep must waive its own new test files:** any new test file you write for the spec
that retires the command (e.g. a driver-state test asserting a step no longer prints the old
command's name) necessarily spells the literal command string in its own test name/assert text
— that file must be added to the NEW sweep's `waivedPaths`. Less obviously, if that same new
test file ALSO asserts the absence of an EARLIER spec's retired literal in the same line
(checking both a prior and the current retirement together), it must ALSO be added to the
EARLIER sibling sweep's own `waivedPaths` list — a collision on a sweep that already shipped and
was passing before this build started.

**Out-of-batch files get edited, not waived.** A file outside your assigned test-file batch
whose only hit is a live assert MESSAGE or a stale comment (never a test that must itself assert
the literal's absence) is the § Gotchas "live assertion of a retired literal outside the File
Plan" class — edit its message text in place (assertion, subject, and strictness untouched) and
record the out-of-plan touch as a deviation, exactly as if the file were in your own File Plan.
Do NOT waive such a file by path: waiving blinds it to every future regression of the retired
name, forever, for a fix that costs one sentence to make correctly. Reserve `waivedPaths` for
files that MUST contain the literal to do their job: a test asserting its absence, a changelog
surface, a dated provenance header — never a file that merely happens to mention the retired
name in passing.

**How to apply:** after drafting a new `sweepRetiredLiteral` call, run `grep -rl '<literal>' .`
(excluding `.git`) over the whole repo — untracked-but-not-gitignored files included — and
classify every hit. A hit that must assert the literal's absence (yours or a sibling sweep's own
test file) gets a `waivedPaths` entry. Every other hit gets its literal mention edited out (in
place, message/comment text only when the file is outside your File Plan) — never waived, and
never written into a brand-new file — including your own memory notes — in the first place.
