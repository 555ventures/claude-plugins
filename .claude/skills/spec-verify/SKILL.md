---
name: spec-verify
description: "Use when exercising a spec-pipeline finding or an acceptance criterion against this repo's real behavior instead of just reading code — executing scripts against synthetic host trees, running scoped tests, and observing exit codes/sentinels."
allowed-tools: Bash(npm test:*), Bash(node --test:*), Bash(node spec/scripts/spec-status.js:*), Bash(bash scripts/spec-patterns.sh:*)
---

# Spec-verify — claude-plugins

There is no app process here (runtime is declared inert in `.claude/spec.config.json`).
Behavior is exercised by **executing scripts and tests**, not by booting anything.

## Launch (the executed leg)

- Full gate: `npm test` (plainly green — no sanctioned-red baseline)
- One suite: `node --test tests/<file>.test.js`
- One script directly: `node spec/scripts/<name>.js --flags` / `bash spec/scripts/<name>.sh` —
  every script documents usage + exit codes in its header comment; the exit code IS the verdict.

## Seed a testable state

Scripts under test take a `--root` (or equivalent) pointing at a host tree. Build a synthetic
one the way the suite does (`tests/helpers.js`):

- `tmpdir(prefix)` — throwaway dir; write `specs/`, `docs/roadmap/`, `.claude/spec.config.json`
  into it with plain `fs.writeFileSync` (see the `host()` factory in `tests/spec-status.test.js`).
- `gitRepo(dir)` — throwaway git repo on `main`, for merge-back/state-gate behavior.
- Realistic multi-file inputs live in `tests/fixtures/` (`minimal-host/`, `parity/`).

## Observe

- Exit codes per the script's documented alphabet (0 pass · 1 findings · 2 usage · specifics above).
- Sentinel lines on stdout (`__SMOKE_PASS__`, `__GATE_PASS__`) and `--json` where offered.
- Doctrine claims are verified by regex over the markdown itself — the same mode
  `tests/doctrine-review.test.js` uses.

## Consumers

`/spec:review`'s verifiers use this skill to exercise findings; T3 builds may use it for
advisory behavioral checks of acceptance criteria — advisory only, it gates nothing until the
run ledger (`.claude/spec-runs.jsonl`) shows its verdicts track real escapes.
