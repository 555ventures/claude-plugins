# 0013. The client rehearses the journey: one themed screen at a time, advanced by clicking the real control, with the session's guesses marked on the screen — never an artboard grid, never a flow pick, never a gray state to judge

- Status: accepted
- Date: 2026-09-10
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (two Fable consults and a seven-agent field survey, 2026-09-10)
- Applies to: ADR-0010 § Decision — the **CLIENT** paragraph (the served journey page as the
  client's surface is superseded by the player this record names; the walk-then-client order
  stands) and the **THEME and SIGNOFF leave the driver** paragraph (narrowed: the theme pick
  returns to `/spec:mocks` as a state between `WALK` and `CLIENT`, picked by the client from a
  shortlist the user composed; `/spec:sketch`'s theme step becomes the already-picked path).
  ADR-0008 § Decision, "theme is picked on the dense screens" — restored in substance, with two
  dense screens instead of one. ADR-0012 stands unchanged: origin by route, capture at note-raise,
  session resolve refused, dated waiver — the player posts through the same client route.
  Brief 22a's CLIENT paragraph (`docs/roadmap/22a-mocks-is-wireframes.md`) is amended in place.
  Specs:
  - specs/20260908/05-candidate-flows-on-the-walk-chain.md — **superseded whole** (hardened,
    never built). Its D3a player mechanics survive as the seed of the client player; its
    premise (the client picks among flows) does not.
  - specs/20260907/11-client-view.md — **superseded whole** (draft, never locked). The grid in
    client mode is not built; the client route serves the player instead.
  - specs/20260906/04-journey-review-page.md — narrowed: the review page remains the session's
    own journey look surface (`stop open journey:<j>`); it is no longer the client's page, and
    D6's `variants:<j>` clause is retired with the dead routing it described.
  - specs/20260906/03-questions-on-the-wireframe.md — narrowed: a question pins to a screen,
    never to one of its `empty`/`loading`/`error` states (`ledger add`/`ledger ask` refuse
    `--state`). Gray states are craft, never a client decision.
  - specs/20260902/09-one-hand-wireframes-one-token-set.md — narrowed: the flat register's
    "no filled button, no shadow" rule (D6) is retired; the register becomes shadcn's Neutral
    component look on the same eleven roles, and a theme is a second value set for those roles.
  - specs/20260907/06-theme-pick-moves-to-sketch.md D2 (the ≤2-screens/dense-screen rule
    rejected) — reversed: the client's theme pick is made on two dense screens.
  - specs/20260907/07-mocks-retires-theme.md — narrowed: the `THEME` state returns to the mocks
    driver under a later spec, between `WALK` and `CLIENT`, with different mechanics (client
    pick on a shortlist, role-swap render); the retired `direction-composed` mechanics stay
    retired.
- Amended by: ADR-0017 — the eleven-role register this record describes becomes shadcn's own
  eighteen colour roles verbatim; this record's register wording is narrowed to match.

## Context

JJ's pipeline is: discovery interview → assumed journeys → the client confirms them on real
screens → `/spec:genesis` → roadmap → the implementation loop. The chain already runs mocks
before genesis writes its brief (ADR-0006, genesis.md § Genesis: Brief State), so the client's
confirmation is already positioned as genesis's input. What was wrong was the surface and the
posture, not the position.

**The enemy is the AI filling gaps, not late change requests.** In JJ's words: "いつも、そもそも
情報が足りなくて、AIが勝手に作り出すと、訳のわからないアプリになるから、それを無くしたい". The
client's pass exists to make the session's guesses visible so the client can strike them — an
information-gathering device, not a contract defence.

**Everything built or drafted made the client an inspector.** The artboard grid (specs/20260906/04)
shows every screen and every state at once with a question inspector beside it; the draft client
view (specs/20260907/11) served that grid in client mode; candidate flows (specs/20260908/05) asked
the client to choose among flows. A small-business owner reads a screen grid with a question panel
as a document with pictures — JJ wrote "rather than reading all the roadmaps and specs", and the
contrast he drew was against documents. He wants the client to *use* it: "as if they are using
the app they want to build".

**The 2026 field has no bridge.** Design tools (Figma Make, Uizard, Mokkup) stop at the design
boundary; spec-driven tools (Spec Kit, Kiro, Tessl, Cursor Plan Mode) put a technical reviewer,
never a client, at the human review; build-first tools (v0, Lovable, Bolt) skip review. Nobody
runs interview → generated journeys → client confirmation → spec → AI implementation as one
chain. Where the field does agree: high-fidelity beats gray for client approval (weak evidence,
vendor blogs); click-through is enough, working forms are not; an assumption log tied to a phase
gate is the best-evidenced practice — which this plugin's ledger already is.

**Two Fable consults, one diagnosis:** "You have been building a screen to inspect. He wants a
rehearsal." The rehearsal is a player, but a back/next player is a slideshow that looks like an
app: it invites polish-not-substance feedback and yields no task-attempt signal, a regression
from the grid. It is only better than the grid with **affordance navigation** (the client advances
by clicking the real control) and **walk-to-unlock** (the approve control appears only after the
last screen was reached by clicking through).

**JJ's rulings on 2026-09-10**, verbatim where it matters:

- Inputs need not persist ("入力は残らなくていいんじゃない？"): a persisting form proves the app
  works, not that the right app is being built. Click-through only, real client data on the screen
  from the first render — "Acme商事/山田太郎" is glided past; the customer with no surname and the
  order with three delivery addresses are what get reactions.
- The client sees a near-production look; gray stays internal. Theme candidates are made by JJ
  with Claude Code, shortlisted by JJ, and the client picks one — after the journeys are drawn,
  before the client walks ("ジャーニーの後" = after the journey is written, before the walk).
- One journey at a time, cut by flow complexity, never by screen count.
- Marks on the guessed parts: yes ("はい"). At a mark the client answers 合ってる / 違う, with an
  optional reason on 違う.
- At the end of a journey: an approve button and one typed sentence ("今、何をしましたか？"). No
  name, no role, no identity of any kind — the URL is exposed over Tailscale for a session to one
  named contact, so there is no second person to distinguish ("名前とか役割いらない").
- The register is shadcn's **Neutral** theme: eighteen colour roles under shadcn's own names,
  plus `--radius`; a theme re-values all eighteen. No React: the mocks stay hand-written HTML,
  so the register is a CSS port of the shadcn component look.
- Rejected: the client picking among flows; per-screen or per-state confirmation; automated
  scoring of client input; further grid improvements.

## Options

**A. Serve the grid in client mode (specs/20260907/11 as drafted).** Rejected. One surface for
two readers with two postures; the client reads it as a document; every state on every screen is
put in front of a person for whom states are craft.

**B. A back/next player.** Rejected. A slideshow that looks like an app — no task-attempt signal,
and it invites feedback on polish over substance.

**C. A rehearsal player: one themed screen at a time, advanced by clicking the real control,
the session's guesses marked on the screen, approve unlocked by walking to the end, one sentence
at approve.** Accepted.

## Decision

**The client's surface is a player, not a grid.** `/client/index.html` lists the journeys; each
journey is walked one screen at a time at `/client/walk/<j>.html`. The client advances by clicking
the element the mock declares as the path to the next screen; clicks on anything else are logged
per screen for the session, never shown to the client. A thumbnail rail and back/next remain as a
fallback. The approve control appears only after the last screen was reached by clicking through.
Approving records one typed sentence — the client's own words for what they just did — against
the journey. No name, role, or author field exists on the client route; the client is one
person with the address for a session.

**The session's guesses are the marks.** Every `inferred` or `invented` product row pinned to a
screen (the existing question) renders on that screen in the player as a mark with 合ってる /
違う and an optional reason. Questions pin to a screen, never to an `empty`/`loading`/`error`
state: gray states stay reachable inside the player and carry no question. A 違う with a reason
becomes a new `said-by-user` `confirmed` row, the guessed row `overridden` and linked; the
player shows the count of guesses still open on the journey.

**The client walks themed screens.** The wireframe register is shadcn's Neutral component look
on the eighteen colour roles `wire-tokens.css` names under shadcn's own spelling; the flat "no
fills, no shadow" register is retired. A theme direction is the same eighteen roles re-valued,
authored by JJ with Claude Code under `design/theme/<kebab>/`. After `WALK`, the session composes candidates on the seed's two
dense screens, JJ shortlists, and the client picks one on the client route; the driver adopts it
and every screen the client walks is served with the picked values in place of the neutral ones.
Internally the atlas and the session's review page stay neutral. `/spec:sketch`'s theme step
finds the theme already picked.

**Derived records, not placeholders.** The seed names three records per entity, which the
session derives for itself from the brief, the research and the references on disk — and every
wireframe draws them. (Amended: this decision originally read *the client's real records*, which
a pre-launch product cannot supply and which sent the session to the user for data. A mock's
records are drawing material, not evidence; the gate asks for three records and nothing about
where they came from.) The seed's dense screen becomes two dense screens, the pair every theme
candidate is judged on.

**What the journey does not do is derived, never typed.** Exclusion rows accumulate from decisions
already made — discovery non-goals marked Later / Won't-this-time, a client's 違う on an
`invented` row, a client note withdrawn as not needed — and render on the last screen of each
journey in the player, in the roadmap genesis emits, and in an appendix a statement of work can
cite by version.

**Retired by this record:** candidate flows (specs/20260908/05, whole); the grid as the client
surface (specs/20260907/11, whole); the dead `variants:<j>` stop routing in `design-atlas.js` and
the review page's header clause about it; per-state questions; the flat register's no-fills rule.
The review page itself survives as the session's journey look surface.

## Consequences

- The client's pass becomes a rehearsal the client can do alone with the address, and the
  session receives three signals it never had: the path of wrong clicks, the client's sentence,
  and the struck guesses. Approval prints the client's sentence per journey beside the waived
  count.
- The theme is picked earlier than ADR-0010 placed it and by a different person. The cost ADR-0010
  named — "the atlas stays gray until the first brief is sketched" — disappears for the client
  route and stays true for the session's own pages.
- The wireframe register looks like shadcn by default. A wireframe is no longer visibly
  "unfinished" to a reader who knows the look; the ledger's `inferred` marks, not the gray, now
  carry the "this is a guess" signal — which is where JJ wanted it.
- Four queued items are closed or re-pointed by this record: q154 (player), q157 (real records),
  q160 (retirement sweep — the sweep lands directly, not inside the replacement spec), and the
  role/persona half of q156 (rejected: no identity on the client route). q153 (exclusions), q155
  (one sentence — accepted as the approve sentence), q158 (waiver price) and q159 (override
  auto-flag) stay queued.
- Not decided here and deliberately left: what the SOW appendix looks like (this repo has no SOW
  concept); whether the seven-day waiver gains a price (q158).

## Dissents

- Fable, second consult: persist the client's inputs across screens so the client sees their own
  data flow (Option A of that consult). JJ rejected: click-through proves the right product is
  being built; a persisting form proves the app works, which is not the question at this stage.
- Fable: record the walker's role (owner / receptionist) on the approval, because the person
  holding the URL is rarely the person who will use the product. JJ rejected: one contact per
  session over Tailscale; no identity fields on the client route.
- Session (this record's author): the grid could be demoted to a builder-only audit rather than
  kept as the session's review page. Kept as the review page — the session still needs the
  all-states view, and it is already the `journey-approved` stop's home.
