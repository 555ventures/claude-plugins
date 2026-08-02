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
- Every new gate/mechanism needs a `spec/doctrine/scaffold-ledger.md` row with a promote/retire condition; new guards enter ADVISORY.
- `spec/templates/grounding-contract.md` is hash-stamped into every host — edit only for genuine contract changes, never wording.
- Behavior changes bump the owning plugin's `.claude-plugin/plugin.json` semver; its `description` is the changelog surface.
- Doctrine prose is deduplicated at touch-time per `shared.md` § Doctrine Authoring — never a sweep; test-pinned redundancy is sanctioned.
- Agent: `doctrine-author` · exemplars: `spec/commands/review.md`, `spec/doctrine/shared.md`.
