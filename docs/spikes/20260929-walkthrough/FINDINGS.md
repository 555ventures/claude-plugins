# Spike: the walkthrough contract, walked once (2026-09-29)

Throwaway. One real journey (hearwell owner onboarding, 4 beats, 4 screens) pushed through the
four calls of docs/roadmap/29-walkthrough-integration.md against a fake in-memory service.
Run: `node docs/spikes/20260929-walkthrough/run.js` (add `--keep` to leave the page up on
port 4790). Nothing here is product code; the spec that follows re-authors the client.

## What held

- The four calls carry a whole wireframe round. 4 screens + the journey file is one request of
  2,550 bytes.
- The plugin's own seed parser and story hash feed the round unchanged. An approval pulled
  from the service compares to the seed by hash; one edited sentence makes it stale with no
  extra call.
- A host with no `walkthrough` block in its config is a silent skip: no request, no file.
- One note record covers all three cases: anchored to a node id, anchored to a position on a
  picture, and no anchor (a screen note).
- Picture positions work as a share of the picture (0..1), so they survive any display size.
- The version is pinned in the path prefix; a request under another prefix is refused by name.
- Refusals are plain and carry a remedy: wrong token, empty token variable (before any
  request), service not running, broken spec.
- Zero packages: built-in `fetch`, `http`, `fs` only.

## What the brief's contract is missing

1. **A reply to a note.** The session answers notes in the next round, but no call carries the
   answer back, so the client never sees what happened to their note. Today's reviewer has a
   thread per note. `mark-round` is per round, not per note.
2. **Which picture a note sits on.** A screen pushed at two widths is two pictures; the note
   record names the screen and state only.
3. **Who owns the round number.** The service assigned it here. A service whose data is reset
   starts again at 1 and the next pull overwrites `design/rounds/1/`. Either the plugin assigns
   the number from the folders it already has, or the round gets an id that cannot repeat.
4. **Approvals are per journey, not per round.** `pull-approvals` returns every approval of the
   project; writing it under one round's folder is arbitrary. A single
   `design/rounds/approvals.json` (or one per journey) fits the data better.
5. **`push-round` is not one request for pictures.** It is one manifest request plus one request
   per picture. A failure halfway leaves a round with missing pictures; the contract needs a
   rule (the round stays hidden until every picture arrived).
6. **The pages' own writes are not in the contract** (a note, an approval). That is correct for
   the plugin, but the service needs them specified somewhere; they belong to the service's
   repository.

## Second pass: the real libraries (same day)

The fake service above was replaced by a prototype built inside a copy of the Mock Review
repository (local branch `proto/walkthrough`, never pushed): Mock Review's own page, real
`@json-render/react` 0.21.0 with a gray catalog of 19 components, Postgres on a Neon dev
branch, and the client in this folder talking to it (`push-hearwell.js`, `pull-hearwell.js`).

What it settled:

7. **json-render does not tell a component its own key.** The service copies each key into
   the element before drawing. With that, every drawn element carries its id.
8. **A repeated element is one key drawn many times.** The anchor needs the key plus a row
   number.
9. **The library's validator checks component names only.** Props need our own check against
   the catalog; the service does it at push and refuses a typo by name.
10. **Mock Review's drag-to-mark gesture and node anchors are not rivals.** The area a person
    drags lands on a real element, because every element now has an id. The gesture stays.
11. **Notes belong to the project, not to a round.** A note survives into the next round and
    its pin stays on the same element.
12. **"No state" must have one spelling on the wire.** The story hash writes no `@state` for a
    beat without one; sending `null` or a made-up `default` is refused or breaks the hash. A
    step without a state omits the key.
13. **Mock Review has no thumbnail map** and **its client confirm shows nothing after the
    press.** The brief assumes the first and inherits the second; the prototype shows the
    confirmed state and a stale state when the story changed.
14. **The plugin owns the round number**, and **a fifth call answers a note.** Both were built
    and proven.

## Not tested

- The real json-render catalog and its gray components (the fake page draws plain boxes).
- Real picture sizes. The test picture is 1×1; a full-page capture is 100 KB to 2 MB.
- Sign-in, several projects per client, hosting.
