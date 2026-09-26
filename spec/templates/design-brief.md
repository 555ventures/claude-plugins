# Design brief — <product>

<!-- ## Users and context: free prose — real users and their context, never a synthetic
     persona. The driver runs no check over this section's content. -->
## Users and context
<one or two paragraphs: who uses this, and the context they're in when they do>

<!-- ## Journeys: one "### <journey>" block per approved journey, in the order the driver
     checks first — this heading must come before any entity-shaped heading in the file.
     Each block's first non-blank line must start "JTBD: When " — the driver refuses by
     journey name when a block is missing or its JTBD line is absent. -->
## Journeys
### <journey-name>
JTBD: When <trigger>, I want to <goal>, so I can <outcome>.

<!-- ## Navigation: one row per task the journeys name, frequency in the user's words, and
     the entry point — task-first, never one list/detail pair per entity. No mechanical
     check runs over the rows; the heading order is checked. -->
## Navigation
| Task | Frequency | Entry |
|------|-----------|-------|
| <task> | <how often> | <entry point> |

<!-- ## Catalog: split every component this brief admits into Used or Excluded, one reason
     per exclusion. Every ### Used name must appear in docs/design/catalog.md's own
     "### " names when that inventory lists any — the driver refuses by name otherwise. -->
## Catalog
### Used
- <component>
### Excluded
- <component> — <reason>

<!-- ## Composites: one row per intent, states as story export names. The table must be
     non-empty, and its Composite column must equal the rules file's own "## Intent to
     pattern" Composite column exactly (same set, either direction) — the driver refuses
     naming the first name only one side has. -->
## Composites
| Composite | Intent | States |
|-----------|--------|--------|
| <Composite> | <intent> | <State1, State2, …> |

<!-- ## Contract: one line naming the rules file — the intent-to-pattern and naming tables
     live there, never copied into this brief a second time. -->
## Contract
Tables: <rules file path> (## Intent to pattern, ## Naming).
