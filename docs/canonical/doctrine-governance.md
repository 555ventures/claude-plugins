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
- **Version discipline:** every behavior change bumps the owning plugin's semver;
  `plugin.json`'s `description` carries a last-3-versions changelog summary.
- **Citations stay live:** `citations-check.js` is the deterministic sweep over `§` heading
  citations (doctor check 15); a citation that resolves nowhere silently drops at
  `shared-for` render time.
- **Doctrine cites owners, never history** (specs/20260902/03-plugin-prose-sweep.md): command,
  doctrine, agent, template, and rules prose states the rule plus one owner id (spec path,
  AC-ID, D-number, ADR, run id); dates, people, hosts, versions, and prior-behavior narration
  belong to specs, ledgers, and ADRs, and `comment-narration.js` refuses them in the suite.

Legacy `<!-- enforcedBy: … -->` / `<!-- unenforced: … -->` comments surviving in doctrine
files are inert annotations, not a maintained registry.
