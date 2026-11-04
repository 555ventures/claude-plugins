---
description: Write a spec with the user and lock it for building
argument-hint: <description | spec path | roadmap brief | design/prototypes/<stem>/contract.json>
model: fable
effort: high
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once. Turn `$ARGUMENTS` into a locked spec; a
prototype contract's behaviour pins become acceptance criteria.

1. Explore the code until you can name every file the change touches.
2. For a new spec, `node ${CLAUDE_PLUGIN_ROOT}/scripts/plan.js new <slug>` writes the template
   and prints its path. Fill it in, "You asked" in the user's own words.
3. Mark gaps `[NEEDS CLARIFICATION: …]` and close them by reading code or running a throwaway
   experiment. Ask the user only about real forks they would care about.
4. If the Intent changes architecture or behaviour, set `architecture: true` and get the
   user's yes.
5. `node ${CLAUDE_PLUGIN_ROOT}/scripts/plan.js lock <path>` (add `--confirmed` after that yes)
   refuses while gaps remain, then locks and commits the spec. Then `node ${CLAUDE_PLUGIN_ROOT}/scripts/queue.js add <path>`.

A brief may become several specs; use `depends_on` when one must land first. Report Next:
`/spec:run <path>`.
