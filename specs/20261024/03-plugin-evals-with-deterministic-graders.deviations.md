# Deviations — 03-plugin-evals-with-deterministic-graders

- D2's doctor script stem `spec-doctor` names no shipped script; the doctor Bash grader matches
  `contract-hash` instead (D8, auto-picked at build).
- The first executed cheap run refused every case: `unknown frontmatter key "context"` in
  `prompt.md`. Each case now carries a `case.yaml` holding `context.scaffold_script` (D9); D4,
  D6, AC-2 and the Contracts block amended to match, four `case.yaml` File Plan rows added.
- D4's invocation lacked `--allow-tools Bash`; without it the CLI grants only read-only tools
  and every Bash grader fails. The README invocations carry it, plus `--trust-plugin` (D9).
- `spec/evals/.gitignore` added (File Plan row added): the first run wrote
  `spec/evals/results/<timestamp>/` inside the plugin, which would otherwise be committed.
- `spec/evals/host.sh` added (File Plan row added): the grounded-host writer all four
  `fixture.sh` files source, instead of four copies of the same config, rules and spec block.
