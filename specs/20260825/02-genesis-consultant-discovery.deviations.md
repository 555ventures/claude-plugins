- AC-20260825-02-2's test was authored with a defective `## Coverage` extraction regex
  (`/^## Coverage\n([\s\S]*?)(?=\n## |\n?$)/m`): under the `m` flag `$` matches before every
  line terminator, so the lazy capture always stopped after the section's first line and the
  ten-line count assertion was unsatisfiable for any file content. Found at build when the
  doctrine worker returned `blocked` against a template authored verbatim to Contracts;
  reproduced by the orchestrator (`node -e` against the real template returned only
  `"- payer: dark"`), then repaired in the tests wave — the lookahead alternative became
  `(?![\s\S])` (true end-of-string, unaffected by `m`), with an inline comment recording why
  the naive form was wrong. Assertion strength unchanged: still exactly ten lines, still the
  full Contracts grammar, still `dark` on every line, verified discriminating against 9-line,
  11-line, and section-bleed mutants of the template string.
