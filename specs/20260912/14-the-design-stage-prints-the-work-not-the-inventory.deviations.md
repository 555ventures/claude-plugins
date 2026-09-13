# Deviations — specs/20260912/14-the-design-stage-prints-the-work-not-the-inventory.md

## AC-20260912-14-9's worked counts line is arithmetically wrong about its own fixture

The AC's literal text asks for `📝 open notes: 3 (1 project · 2 mock) · addressed: 1` from a
fixture of "one open project note, two open mock notes ..., one addressed mock note ..., and one
open question". That fixture has 3 mock-scope notes (2 open + 1 addressed), not 2 — `cmdNotesOpen`'s
`mockCount` counts every non-resolved mock note, addressed included (only `status: "resolved"`
drops a note from the count), so the true, unmodified pre-image output is
`📝 open notes: 4 (1 project · 3 mock) · addressed: 1`, executed and confirmed against
`spec/scripts/mocks-driver.js` as-is (no code under this spec touches this line at all — D1-D4
never reach `cmdNotesOpen`'s counts line).

`tests/mocks/bounded-output-pins.test.js`'s AC-9 test pins the observed, correct line
(`4 (1 project · 3 mock) · addressed: 1`) rather than the spec's literal `3 (1 project · 2 mock)`,
per this repo's own standing guidance on a worked-example arithmetic error (`.claude/rules/spec-pipeline.md`
Gotchas, "the cheapest instance of the same class"): pin the true number, never the spec's wrong
one, and record the departure here rather than silently retyping the AC.

No Decision moves and no other AC is affected — this line is untouched by D1-D4 either way, so
pinning the correct number leaves the pin's own purpose (byte-for-byte "SHALL CONTINUE TO") intact.
