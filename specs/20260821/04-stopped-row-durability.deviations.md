# Deviations — specs/20260821/04-stopped-row-durability.md (build 2026-08-22)

- D9's version target `7.15.0` was already taken at build time (`spec/.claude-plugin/plugin.json`
  read `7.15.1` at HEAD `fda882b`). Bumped to **7.16.0** with D9's changelog paragraph, per the
  recorded `[host]` gotcha that a spec's literal version number is a target, not a pin. Orchestrator
  ruling, applied verbatim by the doctrine worker.
