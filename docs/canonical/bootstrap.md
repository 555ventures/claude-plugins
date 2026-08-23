# Bootstrap (`/spec:init`)

`/spec:init` is a profiling-and-interview session around `spec/scripts/init-gen.js`
(`spec-paths init-gen`). The session judges; the script writes.

## The two subcommands

- **`probe`** — read-only findings JSON. Reports `frontend-design` plugin presence, the
  `testCommand` no-match behavior (a runner that exits 0 on a nonexistent path), and
  at-risk-leg applicability. Exits 0 even on adverse findings: findings are data for the
  interview, never a probe failure.
- **`generate`** — profile in, files out. The **sole writer** of the grounding layer:
  `.claude/spec.config.json`, the pipeline rules file, `.claude/rules/conventions/*.md`,
  `.claude/agents/*.md`, both skills, the `.claude/settings.json` permissions merge,
  `scripts/spec-patterns.sh`, `.claude/spec-manifest.json`, and the gitignore/gitattributes
  entries. Judgment content travels as structured profile fields, never as prose the session
  re-performs.

## Invariants

- **Stamp ordering is enforced in code.** `generatedBy`/`contractHash` are written into the
  config only after `manifest-check.sh` exits 0; a red manifest-check leaves the config
  unstamped and `generate` exits 1. An interrupted session cannot produce a stamped config
  over a red manifest.
- **Refresh is guarded.** Any target file that exists with content differing from what the
  profile would produce makes `generate` exit 3 listing the files and writing nothing, unless
  `--refresh` is passed. User hand-edits are folded into the profile and regenerated, never
  preserved by freehand editing.
- **`.claude/settings.json` is always merge-preserving**, in both modes: every existing entry
  kept, an existing deny covering a would-be allow kept and reported, never overridden. A
  settings file that cannot be read, is not valid JSON, or parses to anything other than a
  JSON object makes the merge impossible — `generate` refuses in pre-flight at exit 2 with a
  remedy matched to the cause, writing nothing anywhere. The merge is computed before the
  write phase, so no settings-derived failure can land after files are on disk.
- **Idempotency is probed, not assumed.** Ignore-entry detection probes a child path
  (`git check-ignore -q .claude/worktrees/x`), never the bare directory — the bare form exits
  1 on a fresh host even when the entry exists, so it re-appends forever. gitattributes
  detection uses `git check-attr merge`.
- **The Worker Contract is extracted at runtime** from the plugin's own
  `templates/grounding-contract.md`, never copied — the hash-stamped file stays the single
  source, so there is no second copy to drift.

## Exit codes (`generate`)

`0` generated, manifest-check green, stamped · `1` manifest-check red, nothing stamped ·
`2` usage / invalid profile / unparseable Worker Contract / settings.json unreadable, invalid
JSON, or non-object · `3` existing targets differ and no `--refresh`, nothing written ·
`4` unexpected internal error — the tree may be partially written, remedy is to re-run; never
a verdict, always a bug.
