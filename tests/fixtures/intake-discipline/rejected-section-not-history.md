# fixture: a Category name that only ever appears in the Rejected findings bullet list is NOT
# prior history for D2 — the accepted table's single reporting-integrity row is a first
# occurrence and may close either way, even though a Rejected bullet below mentions the same
# class in prose (D2, exercised alongside AC-20260805-04-1).

| ID | Source | Category | Stage | Pinned by | Fixed in | Fix |
|---|---|---|---|---|---|---|
| T-1 | fixture source | reporting-integrity | review | `tests/helpers.js` | 1.0.0 | prose(hard) |

## Rejected findings

- **T-REJ-1** (rejected finding, no Category cell): reporting-integrity-flavored complaint that
  must never count as a second accepted-table occurrence of the class.
