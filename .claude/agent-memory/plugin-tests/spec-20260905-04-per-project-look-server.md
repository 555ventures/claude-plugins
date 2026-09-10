---
name: spec-20260905-04-per-project-look-server
description: Test-authoring gotchas when a spec deletes a script the pre-image still spawns — isolate the pre-image's real side effects in red-phase tests, retired-literal self-collision, comment-narration, and the rm-vs-git-ls-files transient.
metadata:
  type: project
  reviewed: 2026-09-10
---

- When a File Plan deletes a script that the pre-image still spawns on the code path a red-phase
  test exercises, the red run executes the OLD script for real. Isolate its side effects (state
  dirs under `HOME`, default ports) with plain env overrides in the test, never by relying on the
  retired script's own env knobs, and drop that scaffolding once the implementation wave lands —
  it is dead code afterwards, not a pin.
- An AC that sweeps `tests/` for a retired literal, exempting only absence-pin assertion strings,
  is tripped by your OWN comments or concatenated path strings that spell the literal. Assemble
  the retired name from runtime fragments and keep prose free of it (see
  [[self-matching-literal-pin-fragment-idiom]]).
- `comment-narration.js` scans `//` comments repo-wide with no baseline: a version-shaped literal or
  a prior-state word ("formerly", "previously") in a brand-new test comment is a live finding. Run
  it before declaring a batch done; assertion messages are not scanned, so historical
  cross-references go there.
- A File-Plan-mandated `rm` of a test file (never `git rm` — test authors never run git) leaves it
  `git ls-files`-tracked-but-missing, which reddens `dependency-free.test.js`'s tracked-source
  sweep until the orchestrator stages the deletion. Expected transient; never edit the sibling
  sweep to hide it.

See also [[banned-literal-loop-dedup-and-blind-spot-sweep]], [[ac1-ac2-banned-literal-collides-with-sibling-sweep]].
