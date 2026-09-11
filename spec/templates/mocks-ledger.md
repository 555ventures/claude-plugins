# Provenance ledger — { project }

<!-- Grammar: spec/doctrine/mocks.md § Provenance Ledger. Enum cells are one fixed word:
     kind product|process|exclusion · tag said-by-user|ratified-doc|inferred|invented ·
     status open|confirmed|overridden|decided (+ optional YYYY-MM-DD). Free text only in
     claim / rejected / note; write a literal pipe as \| . Rows are written by the mocks driver
     (spec-paths mocks-driver), never by hand-typed printf. exclusion rows are derived only —
     run `ledger derive`, never hand-write one. -->

## Assumptions

| id | step | kind | claim | tag | status | rejected | dependents | note |
| - | - | - | - | - | - | - | - | - |

## Misunderstandings

| id | what | step | cost | note |
| - | - | - | - | - |
