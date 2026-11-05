# 38 — A batch tells the truth

Phase: P3 · Depends on: 36 · Primary workspaces: spec/scripts/fanout.js, spec/scripts/run.js,
spec/scripts/queue.js, spec/scripts/status.js, spec/commands/{doctor,genesis}.md, tests · Risk: T1
(reporting, parsing and landing order inside the existing driver) · Design stage: no · Expected
specs: 1

<!-- Minted 2026-11-05 from the fix-round batch (specs 06, 07, 08 built by fan-out on this repo)
     and shop-bltr's final report. Folds queue items q137, q172, q173, q174, q175, q176. -->

## Result

A fan-out batch lands its ready lanes without waiting on a sent-back one, every mark says what it
did, briefs quote the spec faithfully, and the spec on trunk says what was built:

- **Ready lanes land while one is sent back.** While a lane is sent back for a conflict, the other
  MERGE_READY lanes land in batch order, each through the stale-base rebase and pre-ff gate from
  spec 07; the sent-back lane rebases onto the live head in its own dispatch anyway. (In the fix
  round, 06 waited on 08, then 08 waited on 06, and 06 was rebased three times.)
- **A mark says what it did.** `returned` and `resent` print, after the checkpoint line, the lane's
  outcome: `landed as <sha>`, `held — lane N is sent back`, `sent back — conflicts: <files>`, or
  `gate red after rebase: <line>`, together with the Agent call to re-send when there is one.
  The WAIT body names held lanes and refreshes a sent-back lane's run step.
- **A table cell keeps its pipes.** The Decisions and File Plan extractors split a row on `|`
  outside code spans only, so a regex or a shell pipe in backticks survives into the briefs (spec
  06's D2 was mangled).
- **The spec on trunk says what was built.** At COMMIT the driver appends `## As built` to the
  spec when the builder summary or the review advisories record a departure (stale AC wording,
  a renumbered migration, a count that moved, a file outside the File Plan): one bullet each,
  what and why. Decisions stay locked; asking about them is spec 06's job.
- **A brief closes when the user says so.** A brief queue item is never auto-closed when its last
  spec merges; status says `brief NN: all specs done — /spec:queue done NN when the rest is done`.
  (shop-bltr's brief 05 vanished with its Square steps still open.)
- **Doctrine says true things.** doctor.md checks 6 and 8 use the `{ app }`-only design shape
  that grounding-contract.md defines; genesis.md names the seed-derived framework-pricing
  behaviour that genesis.js has. Prose only.

## Not in this brief

- Overlap-aware merge order (an existing spec).
- Anything that asks the user (spec 06) or the host environment (spec 08).

## Acceptance (sketch for the planner)

- Lanes A (ready), B (sent back): marking A returned lands A; the mark prints `landed as <sha>`.
- A returned mark that sends the lane back prints the conflict files and the Agent call.
- A Decisions row with `` `a|b` `` in a cell reaches the brief intact.
- A build whose reviewer advisory notes a renumbered migration lands with `## As built` naming it.
- Merging the last spec of a brief leaves the brief item open and status prints the hint.
