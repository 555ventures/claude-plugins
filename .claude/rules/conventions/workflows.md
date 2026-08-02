---
paths:
  - "spec/workflows/**"
---

# Workflow conventions

- `wf-*.js` is GENERATED — never edit it. Edit `src/wf-<name>.body.js` or `fragments/*.frag`, then `npm run build:workflows`; commit source + generated together.
- Body order is fixed: `export const meta` (pure literal, `whenToUse` names the invoking command) → `// @fragment:normalize-args` at column 0 → `args = normalizeArgs(args)` → per-workflow shape assertion → `// args: {...}` field-by-field comment.
- `args` is a closed alphabet: paths, ids, enums, booleans, command strings. Prose/findings travel on disk as paths the agents Read — never inline.
- Fragment markers `// @fragment:<name>` sit at column 0; `__WF_NAME__` substitutes from the body filename.
- Sandbox has no `require()`, `Date.now()`, or `Math.random()` — shared machinery is inlined by the build step only.
- Agent: `workflow-author` · exemplars: `spec/workflows/src/wf-review.body.js`, `spec/workflows/fragments/normalize-args.js.frag`.
