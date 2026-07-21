# {NNNN}. {Title}

- Status: {proposed | accepted | superseded by ADR-{NNNN}}
- Date: {YYYY-MM-DD}
- Archetype: {archetype} · Audience: {localeScope}
- Deciders: {user} + genesis panel

## Context

{The forces at play — project goal, archetype, audience/locale, hard constraints. Why a
decision is needed now and what is irreversible-ish about it.}

## Options considered

- **{Option A}** — {one-line characterization, with the evidence the panel surfaced}
- **{Option B}** — {one-line characterization}

## Decision

{The chosen option, stated plainly, and the single most important reason it won.}

## Consequences

- {What this makes easier}
- {What this makes harder / what we explicitly accept}

## Applies to

{Post-genesis amendment ADRs only — genesis-time ADRs write the literal line "None: genesis
decision, carried by briefs' Grounding at authoring time." One row per roadmap brief this
decision amends: `NN-{name} — {one line: what changes there}`. The propagation contract:
the effects are edited into every listed brief **in the same session that writes this ADR**
— never left as a pointer for later. An unplanned brief is edited in place (Scope /
Out of scope / Open questions), gets an `Amended by ADR-{NNNN} — {one line}` line in its
Grounding, and superseded lines are ~~struck~~ `(superseded by ADR-{NNNN})`, not deleted. A
brief whose specs are already planned or shipped is never edited: mint a letter-suffixed
successor brief (`NNa-{name}.md`, `Depends on: NN`) carrying the change, and list the
successor here. /spec:doctor audits both link directions.}

## Dissents

{REQUIRED — must be non-empty, or the literal line: "None: all proposers agreed on {dimension}."
Record any minority position the panel surfaced — verbatim option + its core rationale — even
though it was not chosen, so the ADR preserves the option space and reasoning available at
decision time, not just the winner. The genesis state gate and /spec:doctor check that this
section is present.}
