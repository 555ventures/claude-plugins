---
description: Write a spec with the user and lock it for building
argument-hint: <description | spec path | roadmap brief | design/prototypes/<stem>/contract.json>
model: fable
effort: high
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once. Turn `$ARGUMENTS` into a locked spec. A
prototype contract's behaviour pins become acceptance criteria.

1. Explore the code until you can name every file the change touches.
2. For a new spec, `node ${CLAUDE_PLUGIN_ROOT}/scripts/plan.js new <slug>` prints its path.
   Write it from `${CLAUDE_PLUGIN_ROOT}/templates/spec.md`, with "You asked" in the user's
   own words.
3. Mark open gaps `[NEEDS CLARIFICATION: …]`. Close them by reading code or running a
   throwaway experiment. Ask the user only about real forks they would care
   about.
4. If the Intent says architecture or behaviour changes, set `architecture: true` and get the
   user's yes before locking.
5. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/plan.js lock <path>`, which refuses while gaps
   remain, then `node ${CLAUDE_PLUGIN_ROOT}/scripts/queue.js add <path>`.

A brief may become several specs; use `depends_on` when one must land first. End with one
report rendered by `lib/report.js`, Next: `/spec:run <path>`.
