---
name: citations-check-word-before-section
description: citations-check.js resolves a § citation's target file from the ONE WORD immediately before the §, not just from filename tokens — a coincidental match against another scanned doctrine file's basename (design, core, genesis, review, build, plan...) causes a false MISS
metadata:
  type: feedback
  reviewed: 2026-09-03
---

When writing a `§ Section Name` citation in doctrine/command prose, the word immediately
before `§` (after stripping punctuation) is checked against `scannedBasenames` — the basenames
of every file in `spec/commands`, `spec/doctrine`, `spec/agents`, `git/commands` (see
`spec/scripts/citations-check.js`'s `resolveTarget`, the bare-basename branch). If that word
happens to equal another doctrine file's basename (most dangerously `design`, since
`spec/doctrine/design.md` is a scanned file), the checker resolves the citation against THAT
file instead of the citing file itself — even though the sentence never intended to reference
it and even though the "real" target is genesis.md's own heading, one line down.

Concretely hit this on specs/20260827/02-genesis-explore-state.md: `...external/<name>/ for a
supplied design (§ Genesis: Explore State).` — nearWord resolved to `design`, which matched
`spec/doctrine/design.md`'s basename, and `design.md` has no `## Genesis: Explore State`
heading → false MISS. Fix was rewording, not touching the checker: `for a supplied candidate
bundle (§ Genesis: Explore State)`.

**Why:** the checker is deliberately narrow (bare-basename match checks only the word adjacent
to `§`, per its own header comment) — this is correct design, not a bug to route around by
editing the script. The doctrine-author agent owns the wording, so the fix is always a reword.

**How to apply:** after writing or editing any `§ Section Name` citation, run
`node --test tests/consistency/citations-check.test.js` (or `node spec/scripts/citations-check.js
--root .` directly) before declaring the file done — don't just eyeball the sentence. If a MISS
appears with a target file that makes no sense, suspect the word immediately before `§` first;
reword to put a neutral word there rather than one that happens to be `design`/`core`/`genesis`/
any other scanned-file basename. Related: [[repo_naming_shared_vs_core]].
