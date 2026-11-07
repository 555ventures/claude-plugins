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
   live ADR beats the brief's wording. Then explore the code until you can name, for each
   Decision, the existing function it changes, what it replaces and what it makes dead (a DELETE
   row in the File Plan). A Decision that adds a flag, mode, step, file or config key says in its
   reason why the existing one cannot carry it. A bug in a path that exists for one edge means the
   path goes, not a branch on it.
2. For a new spec, `node ${CLAUDE_PLUGIN_ROOT}/scripts/plan.js new <slug>` writes the template
   and prints its path. Fill it in, "You asked" in the user's words, `brief: NN`, each ADR
   constraint the change touches as a Decisions row citing it, ACs as `AC-YYYYMMDD-NN-k`. A
   spec that departs from an accepted ADR sets `architecture: true`. An AC that needs recorded
   evidence (a listing, a render, a count) names `<spec>.run/evidence.md`, never the commit message.
   A criterion no test will cite goes under an optional `## Retired criteria` after the ACs, one line
   each: `- AC-… — retired by Dn: …` (a Decision of this spec drops it; the gate lets its last test go)
   or `- AC-… — checked at review: …` (an AC of this spec read in the diff: prose, a grep, a count).
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
   A spec planned from a prototype contract sets `prototype: <stem>` in the frontmatter. Each
   active behaviour pin is an AC ending `(pin pN)`; each look pin is a Decisions row
   `LOOK: <sentence> (pin pN)`. The contract may spread over several specs, each citing the
   stem. A pin is the user's confirmed ruling: never write it as `[asked: …]`.
4. If the Intent changes architecture or behaviour, set `architecture: true` and get the
   user's yes. If that yes added or overturned an architecture decision, write
   `docs/adr/NNNN-slug.md` from `${CLAUDE_PLUGIN_ROOT}/templates/adr.md` with Status
   `accepted`, set any superseded ADR's Status to `superseded by ADR-NNNN`, and cite it in
   Decisions. Behaviour changes get no ADR.
5. `node ${CLAUDE_PLUGIN_ROOT}/scripts/plan.js lock <path>` (add `--confirmed` after that yes)
   refuses while gaps or `<placeholders>` remain, and while the sign-off line says `none` for a
   `breaking: true` spec or a Decisions row that takes something away from users and carries no
   `[asked:]` (it names the row; ask, then fill the line). It also refuses a File Plan that lists
   another spec file, because a build may not edit one: drop the row and edit that spec on the
   trunk, committed before lock or after the merge. Otherwise it locks, commits and prints Next;
   run it. For a `prototype:` spec it also reads the contract: an active behaviour pin with no
   `(pin pN)` AC in this spec or an earlier locked one citing the same stem refuses the lock by
   id (write the AC, or `node ${CLAUDE_PLUGIN_ROOT}/scripts/prototype.js <stem> drop pN --why …`),
   and once every behaviour pin is covered the queued plan item closes.

A brief may become several specs; more than ten Decisions is two specs or a wrong design: cut before lock (`plan.js lock` refuses
past 12 Decisions or 90 lines). Use `depends_on` when one spec must land first. A brief that has specs
stands for them in the queue (ADR-0044): do not tick it, because a tick sends it to the back. A brief
folded into another gets `> Superseded by NN` under its title. Report Next.
