---
date: 2026-10-07
status: done
build_base: main
tier: critical
area: prototype
breaking: false
depends_on: [specs/20261007/01-approve-writes-a-behaviour-contract.md, specs/20261007/02-the-prototype-opens-from-words-a-brief-or-a-stem.md]
depended_on_by: []
brief: 28a
spiked: 2026-10-07
open_markers: 0
diff_base: 96fc7d80174a9676a49781b65b5b97eaf8fcdd34
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261007-03-1, AC-20261007-03-2, AC-20261007-03-3, AC-20261007-03-4, AC-20261007-03-5, AC-20261007-03-6, AC-20261007-03-7, AC-20261007-03-8]
---

# Plan cites, the build replays, and status derives the delete

## Goal

`/spec:plan` takes a behaviour contract as its feature description, reads the contract, the
pictures and the pins — never the prototype's file tree — and writes ordinary specs stamped
`prototype: <stem>` whose File Plan comes from the production architecture. The build driver's
behaviour lane becomes one state, `REPLAY`: after a green gate the driver copies the contract's
test file into the tree, runs it against the production build through the host's `e2eRun`, and
prints a look stop that puts the production screens beside the prototype's pictures until the
user says `close enough`. Review proves the replay through a `contract` manifest leg the pin
criteria name as their oracle, and the reviewer treats a prototype line in the diff as a hard
finding. When the last spec citing a stem closes, the review driver closes the prototype;
`/spec:status` prints the close paste whenever every citer is done and the worktree is still
there. The harden merge, the structural capture gate, the "refuse while `proto/` exists"
admission and the harden-branch deletion are deleted. Done means: on a fixture host a
`prototype:` spec builds through `REPLAY` to `COMMIT` with the row carrying `replay`, a red replay
stops it, review emits the `contract` leg from the build row, the review close deletes the
prototype only when it is the last citer, and status names the paste.
