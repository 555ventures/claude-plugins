# Deviations — 02-a-delegated-driver-stops-on-disk

- D7 names `Delegated Stops` for the `run`, `build`, `review` and `fix` lists in `spec/bin/spec-paths`, but that file has only `run` and `fix` section lists (build and review are stages under `run`); the prose pin covers `run` and `fix` only.
- AC-14's "following bare run prints STOPPED's normal text with no PENDING_QUESTION" is tested with the marker unset, since a delegated STOPPED with the round unspent writes a fresh question by AC-6.
- D8 names fix.md steps 1, 4, 6; in the live file the decisions stop is step 3 and the dispositions stop sits in step 4 (review), so the delegated twins went on the dirty-tree stop (step 1), step 3 and step 4 — the three kinds are unchanged.
- spec-paths: `Delegated Stops` added to the `run` and `fix` lists only (no `build`/`review` lists exist there); placed before `Question Style`, since `fix` has no `Decisions` section to follow.
- Bare-run contract (D5) leaves an answered `dispositions` file in place (prints the resume step, no consume, no `marks.answered`): the resuming `--mark dispositions` reads those answers and consumes the file itself (D3), so consuming at print time would re-ask.
- `question-style-gate.js --file` with an unreadable file exits 2 naming the file (D2 is silent on that case).
