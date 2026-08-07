# status — canonical

`done` carries a derived observation sub-state from `stage:"observe"` ledger rows (written
by `observe-ci.js` — root-only, ancestry-validated against the spec's close commit,
transient failures never resolve): pending until a containing run's outcome is recorded;
the latest-`runAt` qualifying row is the state; red turns the dashboard headline 🔴 and
outranks all other `--next` picks as an oracle-shaped `/spec:escape` entry carrying
branch/sha/url; `ci:"none"` completes observation only on structurally CI-less hosts.
(specs/20260805/03-done-unobserved-observation.md)
