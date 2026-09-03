# Provenance ledger — { project }

<!-- Grammar: spec/doctrine/mocks.md § Provenance Ledger. Enum cells are one fixed word:
     kind product|process · tag said-by-user|ratified-doc|inferred|invented ·
     status open|confirmed|overridden|decided (+ optional YYYY-MM-DD). Free text only in
     claim / rejected / note; write a literal pipe as \| . Rows are written by the mocks driver
     (spec-paths mocks-driver), never by hand-typed printf. -->

## Assumptions

| id | step | kind | claim | tag | status | rejected | dependents | note |
| - | - | - | - | - | - | - | - | - |

## Misunderstandings

| id | what | step | cost | note |
| - | - | - | - | - |
