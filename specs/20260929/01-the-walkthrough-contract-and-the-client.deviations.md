# Deviations — 01-the-walkthrough-contract-and-the-client

- tests: the PNG fixture bytes are written by `tests/walkthrough/fixture.js` (`makePictureWork`), not by `stub-service.js` — the stub's three-argument command line (`<port> <answers.json> <log.jsonl>`) has no picture role; no binary file is committed either way.
- tests: `stub-service.js` takes port `0` and prints `PORT <n>` on stdout once bound; its answers file supports `raw`, `hang` and a `$contentHash` token (replaced by the request body's `contentHash`) beyond the plain status/headers/body, and repeats the last scripted answer once a list is used up.
- tests: the spec does not say whether `validate` findings and `check` findings go to stdout or stderr; the tests read stdout and stderr together for those lines, and assert the verdict lines (`round ok: …`, `contract ok: …`) on stdout.
- tests: `spec-paths` usage-string membership of the three new keys (D13) is asserted inside the rewritten `AC-20260926-03-8` test alongside the AC-18 path checks.
