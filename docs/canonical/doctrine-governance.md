# Doctrine governance

v7.0.0 (2026-08-17) retired the claims registry (`claims-lint.js`, `claims-baseline.json`,
the `enforcedBy:`/`unenforced:` marker ratchet) and the scaffold-ledger guard registry. The
governing rules now:

- **One binding home per rule** (core.md § Doctrine Authoring): prose that restates canon
  living elsewhere shrinks to a pointer; touch-time dedup, never a sweep.
- **Behavior is pinned by behavioral tests** that execute it — never by regexes over prose.
- **Incident policy** (core.md § Incident Policy): an incident is fixed with a behavioral
  test in the same session; only a third recurrence of a class — counted across every readable
  repo ledger on this machine, numbers from `node "$(spec-paths fleet-reader)" --json` — earns a
  standing guard, and
  that guard is a deterministic script with an exit code — never prose, never a registry row.
- **Version discipline:** every change under a marketplace plugin directory bumps that
  plugin's semver via `node scripts/plugin-bump.js --bump --plugin <name> --changelog
  "<paragraph>"`, which derives the next minor and rotates `plugin.json`'s `description`
  changelog to its last three entries. Specs cite the command, never a version number.
  `node scripts/plugin-bump.js --check` runs in the gate and is red when a plugin directory
  changed since the merge base without a higher version.
- **Citations stay live:** `citations-check.js` is the deterministic sweep over `§` heading
  citations (doctor check 15); a citation that resolves nowhere silently drops at
  `shared-for` render time.
- **Doctrine cites owners, never history** (specs/20260902/03-plugin-prose-sweep.md): command,
  doctrine, agent, template, and rules prose states the rule plus one owner id (spec path,
  AC-ID, D-number, ADR, run id); dates, people, hosts, versions, and prior-behavior narration
  belong to specs, ledgers, and ADRs, and `comment-narration.js` refuses them in the suite.

- **A driver-stepped command file states the loop contract and the session's judgments only**
  (specs/20260908/06-command-prose-states-contracts.md): the driver prints every step's
  envelope, exits, caps and remedies, and the command file never restates them — build,
  review, run and mocks join genesis. Every `## Rules` section holds at most eight bullets
  (`prose-cap`, pinned in `read-load.test.js`), and every `shared-for` section list is pinned
  exactly there, so a section cannot join a command's read surface silently.
- **The host pipeline-rules file is path-scoped** and arrives with the `spec.config.json`
  Read; no command re-reads it. A host whose rules did not arrive with the config Reads them
  once.
- **The genesis brief is edited in place** — one line per changed key after each interview
  answer — and rendered in full exactly once, at discovery's end.

Legacy `<!-- enforcedBy: … -->` / `<!-- unenforced: … -->` comments surviving in doctrine
files are inert annotations, not a maintained registry.
