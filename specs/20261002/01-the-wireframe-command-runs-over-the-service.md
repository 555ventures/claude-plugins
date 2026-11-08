---
date: 2026-10-02
status: done
tier: critical
area: design
breaking: true
depends_on: [specs/20260929/01-the-walkthrough-contract-and-the-client.md]
depended_on_by: []
brief: 29
spiked: 2026-10-02
open_markers: 0
build_base: design-retool
diff_base: fee109970d48f8c96952beaa9516855604515de2
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261002-01-1, AC-20261002-01-2, AC-20261002-01-3, AC-20261002-01-4, AC-20261002-01-5, AC-20261002-01-6, AC-20261002-01-7, AC-20261002-01-8, AC-20261002-01-9, AC-20261002-01-10, AC-20261002-01-11, AC-20261002-01-12, AC-20261002-01-13, AC-20261002-01-14, AC-20261002-01-15, AC-20261002-01-16, AC-20261002-01-17, AC-20261002-01-18, AC-20261002-01-19]
---

# The wireframe command runs over the service

## Goal

`/spec:mocks` stops driving a React mock app through an npm reviewer package and becomes the
wireframe command over the walkthrough service: the session writes the client's stories, draws
each screen as one gray json-render file, sends rounds through the plugin's own client, reads
notes and confirmations back as files, and finishes when every story is confirmed and no note
waits for an answer. A project with no `walkthrough` config block draws nothing and confirms each
story in the terminal. The reviewer package, its contract file, the mock-app templates and every
script, doctrine line and test that named them are deleted. Done means: the driver runs the whole
loop against a stub service, genesis reads the story count from the seed and the open-note count
from the latest round, and no shipped file names the retired package.
