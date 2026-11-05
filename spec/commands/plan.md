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
   experiment. The test for every question: would the client need to sign this off? The real
   forks are: a UI flow or screen the user will see change; a permission, restriction or
   something taken away from a user; what happens to existing data (migration, deletion,
   visibility, retention); pricing, limits or a paid service; a breaking change for existing
   users or integrations; a hard-to-reverse architecture choice (persistence, framework, auth,
   deploy target). Anything on the list is asked once, in ONE batched AskUserQuestion of at
   most four questions before lock, recommended option first, each option carrying its
   consequence; write the answer into Decisions as `[asked: <what the user chose>]` at the end
   of the row, and fill the Intent line `Client sign-off: <what was asked> — <what they chose>`.
   Anything off the list: decide and write the Decision with its reason. A business rule the
   brief and code do not state is a `[NEEDS CLARIFICATION: …]` marker, never a guess: product
   facts are asked, never derived. Set `breaking: true` in the frontmatter for a breaking change.
4. If the Intent changes architecture or behaviour, set `architecture: true` and get the
   user's yes. If that yes added or overturned an architecture decision, write
   `docs/adr/NNNN-slug.md` from `${CLAUDE_PLUGIN_ROOT}/templates/adr.md` with Status
   `accepted`, set any superseded ADR's Status to `superseded by ADR-NNNN`, and cite it in
   Decisions. Behaviour changes get no ADR.
5. `node ${CLAUDE_PLUGIN_ROOT}/scripts/plan.js lock <path>` (add `--confirmed` after that yes)
   refuses while gaps or `<placeholders>` remain, and while the sign-off line says `none` for a
   `breaking: true` spec or a Decisions row that takes something away from users and carries no
   `[asked:]` (it names the row; ask, then fill the line). Otherwise it locks, commits and prints
   Next; run it.

A brief may become several specs; use `depends_on` when one must land first. When the brief
is fully planned run `/spec:queue done <NN>`; a brief folded into another gets
`> Superseded by NN` under its title. Report Next.
