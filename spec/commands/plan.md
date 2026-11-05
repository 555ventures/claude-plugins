---
description: Write a spec with the user and lock it for building
argument-hint: <description | spec path | roadmap brief | design/prototypes/<stem>/contract.json>
model: fable
effort: high
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once. Turn `$ARGUMENTS` into a locked spec; a
prototype contract's behaviour pins become acceptance criteria.

1. Read the brief and the specs already marked `brief: NN`, then `ls docs/adr` and open every
   ADR the brief cites or whose title touches the change, following any `superseded by`. A
   live ADR beats the brief's wording. Then explore the code until you can name every file the
   change touches.
2. For a new spec, `node ${CLAUDE_PLUGIN_ROOT}/scripts/plan.js new <slug>` writes the template
   and prints its path. Fill it in, "You asked" in the user's words, `brief: NN`, each ADR
   constraint the change touches as a Decisions row citing it, ACs as `AC-YYYYMMDD-NN-k`. A
   spec that departs from an accepted ADR sets `architecture: true`. An AC that needs recorded
   evidence (a listing, a render, a count) names `<spec>.run/evidence.md`, never the commit message.
3. Mark gaps `[NEEDS CLARIFICATION: …]` and close them by reading code or a throwaway
   experiment. Ask the user only about real forks.
4. If the Intent changes architecture or behaviour, set `architecture: true` and get the
   user's yes. If that yes added or overturned an architecture decision, write
   `docs/adr/NNNN-slug.md` from `${CLAUDE_PLUGIN_ROOT}/templates/adr.md` with Status
   `accepted`, set any superseded ADR's Status to `superseded by ADR-NNNN`, and cite it in
   Decisions. Behaviour changes get no ADR.
5. `node ${CLAUDE_PLUGIN_ROOT}/scripts/plan.js lock <path>` (add `--confirmed` after that yes)
   refuses while gaps or `<placeholders>` remain, then locks, commits and prints Next; run it.

A brief may become several specs; use `depends_on` when one must land first. When the brief
is fully planned run `/spec:queue done <NN>`; a brief folded into another gets
`> Superseded by NN` under its title. Report Next.
