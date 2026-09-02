---
name: collision-closure-tier-additive-not-exclusive
description: D3's executes tier is additive on top of likely/mentions, not a runnable/non-runnable branch — the ordering clause and Contracts example are the tell
metadata:
  type: feedback
  reviewed: 2026-09-02
---

When a spec Decision reads like a clean binary branch ("runnable targets tier X; non-runnable
targets keep tiering Y unchanged"), check whether a companion sentence implies overlap before
implementing it as mutually exclusive. specs/20260830/01-collision-closure-exec-recall.md D3 reads
that way on first pass — my first implementation made a runnable target's hits go to `executes`
only, never `isLikely`. That reddened the pinned, do-not-touch test AC-20260814-05-13 (`src/b.js`,
a `.js` — hence runnable — target expected to still tier `likely` off a proximate
`deepStrictEqual`).

**Why:** D3 also says "Per target, the human listing prints `executes:` before `likely:`/`mentions:`"
and "A file that hits both a runnable and a non-runnable target may appear in both `executes` and
`likely`." The ordering clause is vacuous under a mutually-exclusive reading (nothing to order
within one target's block); it only means something if a single runnable target's hit can carry
both tiers. The Contracts sample listing (`spec/scripts/foo.js` shows only `executes:`) is
consistent with the additive reading too — that example's hit just isn't near a `deepStrictEqual`,
so `likely` never fires for it, not because runnable suppressed the check.

**How to apply:** the correct implementation runs `isLikely` unconditionally for every hit
(runnable or not, keyed on the D1 suffix) — exactly as before this spec — and layers `executes`
on top only when the target is runnable. The one asymmetry: the `mentions:` catch-all bucket is
suppressed for runnable targets (every one of their hits is already visible under `executes:`), so
only `likely:` can co-occur with `executes:`, never `mentions:`. Before concluding a Decision forces
a pinned "never weaken" test to redden, re-derive the Decision from every sentence in it (not just
the first clause that seems to answer the question) — the ordering/overlap clause was the one that
resolved it without needing to escalate as `blocked`.
