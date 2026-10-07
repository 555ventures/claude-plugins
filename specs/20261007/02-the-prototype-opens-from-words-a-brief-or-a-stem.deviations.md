# Deviations — 02-the-prototype-opens-from-words-a-brief-or-a-stem

- A3 false in part: fixture.js bare()/mark() hardcode the brief path as first argument, so tests/prototype/entry.test.js drives the driver through its own local drive() over runNode with fixture.js setupHost/threePins/withEnv instead; fixture.js is untouched.
- D1 unstated case: a words idea (no `--stem`) whose derived slug equals a stem already opened from a DIFFERENT idea exits 2 naming the `--stem` remedy, so two ideas never share one prototype directory; `--stem` on a brief or stem argument exits 2 (words shape only). Neither refusal is in D1's text.
- D3 needed no code change: `e2eFileOf()` already substituted `{stem}` and nothing substituted `{brief}`.
- Doctrine: `spec/commands/prototype.md`'s driver-loop and checkpoint lines rename the `<brief path>` placeholder to `<arg>`, beyond D5's list, so they stop describing brief-only input.
