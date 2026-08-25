- D7's target text cites "§ Render gate" in `grounding-contract.md`, but no `## Render gate`
  heading existed there (the `design.render` paragraph sat un-headinged under
  `## Required config keys`). Added a `## Render gate` heading immediately above that
  paragraph (text unchanged) so the citation resolves; verified with
  `node "$(spec-paths citations-check)" --root .` → MISS=0.
- The doctrine rewrite rendered D7's `render` parenthetical as "(REQUIRED — § Render gate)",
  contradicting the `grounding-contract.md` paragraph it cites ("`design.render` is optional",
  spec 01 D15, which D7 leaves unchanged). Orchestrator corrected `spec/doctrine/design.md` to
  a plain "(§ Render gate, `grounding-contract.md`)" citation; the spec's Contracts block never
  said REQUIRED.
