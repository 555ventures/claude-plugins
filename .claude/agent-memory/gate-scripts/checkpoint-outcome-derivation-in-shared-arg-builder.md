---
name: checkpoint-outcome-derivation-in-shared-arg-builder
description: Deriving a per-call verdict.js flag (--checkpoint) inside the driver's one shared viaModelArgs() arg-builder rather than at each of the three call sites
metadata:
  reviewed: 2026-09-02
  type: project
---

CORRECTED 2026-09-01 (specs/20260901/09-disposer-gate.md D4/D6, brief 18b): the session-change
CHECKPOINT this entry originally described (marks.checkpointOverride/checkpointCleared/checkpoint,
loop-only, enum cleared|stamp-appeared|overridden|not-reached) is RETIRED outright — do not follow
the OLD derivation below on a live codebase; `checkpointStillParked()`, `checkpointStamp()`, and
every `marks.checkpoint*` field are deleted. The replacement mechanism is a disposer-agent mark
(`marks.disposer = {file, iteration, overrides}` or `{file:null, iteration, overrides:0,
empty:true}`, recorded by `handleDispositions()`), and the outcome enum is now
`disposer|empty|not-reached`, valid on BOTH `--via loop` and `--via direct` (the old loop-only
restriction is gone too). The shared-arg-builder PATTERN below still holds and is why this entry
is corrected in place rather than deleted.

spec-review-driver.js's three verdict.js passes (hard-stop, escalate, close) share one arg-builder,
`viaModelArgs(n)` — now taking the pass's own iteration `n` as a parameter, because
`checkpointOutcome(n)` must compare `marks.disposer.iteration` against THIS pass's iteration (a
hard-stop pass has no disposer mark at all yet; an escalate/close pass's `n` is the reviewer-return
iteration whose dispositions produced it). `checkpointOutcome(n)` returns `{outcome:'not-reached'}`
when no disposer mark exists for iteration `n`, `{outcome:'empty'}` when `marks.disposer.empty`,
else `{outcome:'disposer', overrides:k}` — always defined now (never `null`), so `viaModelArgs`
always pushes `--checkpoint <outcome>` on every pass, both via values.

**Why:** matches this repo's existing pattern (--via/--model already work this way) and avoids
touching three otherwise-unrelated functions (`runHardStopVerdict`, `writeEscalateRow`,
`doCloseWork`) for one derived field — now with the correct disposer-mark-vs-iteration comparison
instead of a loop-only stamp predicate.

**How to apply:** when a spec says "the driver derives X inside the shared arg-builder" for a
flag that varies per verdict pass, add a small pure derivation function next to the state it
reads, thread whatever call-site-local value it needs (here: the pass's own iteration number) as
a parameter rather than a global read, and splice its result into the shared builder's returned
array. Only omit the flag entirely when the spec says the flag is genuinely inapplicable in some
call context (e.g. profile release) — do not assume a flag is loop-only or via-restricted without
re-checking the current spec; that assumption is exactly what broke here.
