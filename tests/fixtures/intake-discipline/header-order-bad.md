# fixture: Fix column placed before Fixed in — a name-grep for "Fixed in" alone still resolves
# unambiguously, but the column-order guard (AC-20260805-04-5) must flag Fix landing ahead of
# Fixed in, since D1 requires it appended last.

| ID | Source | Category | Stage | Pinned by | Fix | Fixed in |
|---|---|---|---|---|---|---|
| S-1 | fixture source | doctrine-rot | doctor | `tests/helpers.js` | mechanism(tests/helpers.js) | 1.0.0 |

## Rejected findings

- nothing rejected in this fixture
