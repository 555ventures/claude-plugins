---
paths:
  - "spec/commands/**"
  - "spec/doctrine/**"
  - "spec/agents/**"
  - "spec/templates/**"
  - "spec/hooks/**"
  - "git/commands/**"
---

# Doctrine & command conventions

- Commands reference scripts via `spec-paths <key>` — never a literal plugin path (`${CLAUDE_PLUGIN_ROOT}` expands only in hooks.json/frontmatter).
- `§ Section Name` citations must match a `## ` heading in the cited file byte-for-byte (prefix match tolerates parentheticals) — `shared-for` filtering silently drops mismatches.
- New standing guards are deterministic scripts earned by a third recurrence of a class (core § Incident Policy) — never prose, never a registry row.
- `spec/templates/grounding-contract.md` is hash-stamped into every host — edit only for genuine contract changes, never wording.
- Behavior changes bump the owning plugin's `.claude-plugin/plugin.json` semver; its `description` is the changelog surface.
- Doctrine prose is deduplicated at touch-time per `core.md` § Doctrine Authoring — never a sweep.
- Agent: `doctrine-author` · exemplars: `spec/commands/review.md`, `spec/doctrine/core.md`.
