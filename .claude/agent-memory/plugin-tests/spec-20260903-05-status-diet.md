---
name: spec-20260903-05-status-diet
description: Test-authoring gotchas for the status-diet spec (default four-block render, decide/hygiene anomaly split, --all) — fixture tricks for the blocked-top and decide-cap ACs.
metadata:
  type: project
---

specs/20260903/05-status-diet.md build: authored tests/status/status-diet.test.js (new, AC-1/2/3/4/5/7/8),
retagged/rewrote 13 tests across tests/spec-status.test.js and tests/status/red-alarm.test.js. Confirmed
red: 21 fail / 35 pass across the three files pre-implementation (all 21 are the touched/new assertions;
zero regression to untouched tests).

**Blocked-top footer fixture needs a rank inversion, not natural naming.** AC-20260903-05-8's
"waiting on 01-inflight" literal requires the TOP-sorting blocked entry's blocker to be named
"01-inflight" — but deriveNext() sorts blocked ties by rank (implementing=0 < hardened=1) before
path. To get the entry that *depends on* the file literally named `01-inflight.md` to sort first,
give the dependency file the "01-inflight.md" name but status `hardened` (rank 1) and make the
actual top pick (that should sort first) `implementing` (rank 0) even though its own file is named
something else (`02-blocked.md`). Two mutually-blocking specs, ranks inverted from what the names
suggest. Because both entries are blocked, the real footer also carries a `· 1 waits behind it`
clause (deriveNext's wait-count n includes every non-top entry, blocked or not) — the AC's literal
doesn't show this clause, so I asserted a PREFIX match (`^🟠 next is blocked · waiting on
01-inflight\b`) rather than a full-line match, and documented the assumption inline. This is a
judgment call, not a spec-confirmed exact string — worth re-checking against the real
implementation's footer once it lands, in case the intended fixture was actually meant to have
zero other open entries (which turned out to be structurally impossible: any spec with a known
status always gets its own deriveNext entry, so a "blocked on X" fixture always has >=2 entries
unless X is unknown-status, draft, or otherwise excluded — all of which add their own anomaly/kind
noise).

**Decide vs. hygiene anomaly counting under D2.** `skipped-brief` and `out-of-order` are the two
DECIDE kinds; everything else is hygiene. Under the untouched pre-image, decide-shaped anomalies
still fold onto a Next line when their `detail` string contains the entry's `path` (old fold
behavior) — e.g. an `out-of-order` anomaly for the picked ready-brief's own file folds onto that
brief's Next line instead of appearing in the bare anomalies-section list. This makes an
old-code "count anomalies section entries" assertion structurally different from the total
anomalies count — don't be surprised when a 5-anomaly fixture shows only 4 in the pre-image's
`⚠️ Anomalies (N)` line; the accounting difference is exactly the class of bug the spec's D1/D3
fix, so it's a legitimate red, not a fixture bug (verified by checking anomalies.length via
`--json` separately, and confirming the fold explains the discrepancy).

See also [[spec-20260903-02-whole-suite-review-leg]] and [[spec-status-derived-viewer]] for the
surrounding spec-status.js architecture.
