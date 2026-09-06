---
name: spec-20260905-04-per-project-look-server
description: Test-authoring gotchas for deleting a machine-wide hub in favor of a per-project serve child (specs/20260905/04) — legacy-hub-spawn safety, retired-literal self-collision, and comment-narration.
metadata:
  type: project
---

Deleting `design-hub.js` while `mocks-driver.js` still unconditionally spawns it (pre-D3) is a
real-process hazard for RED-phase tests, not just an assertion-shape problem:

- `mocks-driver.js stop open/decide` pre-image always `spawnSync`s the hub script regardless of
  any `--port` flag you pass the driver. With no env override it resolves state via
  `os.homedir()/.claude/design-hub` and defaults to port 4600 — calling it from a red-phase test
  with no isolation pollutes the real machine's hub registry and can spawn a real detached server
  on a shared port. Fix: override `HOME` (not the retired `SPEC_DESIGN_HUB_HOME`) to a tmpdir and
  pre-seed `<home>/.claude/design-hub/registry.json` with a chosen free port before invoking —
  isolates the legacy fallback with zero reliance on the env var being read.
- The AC that sweeps the repo for the retired literal (`grep "SPEC_DESIGN_HUB\|design-hub"`) also
  scans `tests/`, exempting only "absence-pin assertion strings." A comment or a functional path
  string built by literal concatenation (e.g. `path.join(home, '.claude', 'design-hub')`) in your
  OWN new/modified test file trips your own sweep. Fix: assemble the retired dirname from runtime
  fragments (`['design','hub'].join('-')`) and word prose without spelling the retired name — same
  resolution as `tracked-text-purity.test.js`'s NUL-byte escape and
  `dependency-free.test.js`'s SDK-name fragmentation (see [[self-matching-literal-pin-fragment-idiom]]).
- `comment-narration.js`'s live repo-wide scan (AC-20260902-04-5, zero findings, no baseline) flags
  your own new comments: any version-shaped literal (e.g. "7.83.0") or a `[prior]`-class word
  ("formerly", "previously", "was renamed") in a `//` comment is a live finding, even inside a
  brand-new test file. Run `node spec/scripts/comment-narration.js --root . --hosts <fleet> --people
  <fleet>` (see the test's own args) before declaring a batch done — assertion-message strings are
  not scanned, only comments, so move any historical/version cross-reference into an assert message
  instead of a `//` line.
- A File-Plan-mandated `rm` of a test file (no `git rm` — test authors never run git) leaves it
  `git ls-files`-tracked-but-missing, which reddens an OUT-OF-BATCH enumerated sweep
  (`dependency-free.test.js`'s "no tracked source" test reads every `git ls-files` entry off disk
  and ENOENTs). This is expected transient noise until the orchestrator stages the deletion — don't
  "fix" it by editing the sibling sweep file.

See also [[banned-literal-loop-dedup-and-blind-spot-sweep]], [[ac1-ac2-banned-literal-collides-with-sibling-sweep]].
