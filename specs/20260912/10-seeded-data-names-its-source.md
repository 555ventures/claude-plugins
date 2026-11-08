---
date: 2026-09-12
status: done
tier: standard
area: design-mocks
design: false
breaking: true
depends_on: [specs/20260912/09-a-mock-may-not-invent.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-12
open_markers: 0
build_base: main
diff_base: cdef0d42f6ba03f7a53a128e74be9b0beabb2841
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260912-10-1, AC-20260912-10-2, AC-20260912-10-3, AC-20260912-10-4, AC-20260912-10-5]
---

# Seeded data names its source

## Goal

The seed's records are the one set of facts every screen in a journey shares, and today each
screen retypes them. A customer's name is typed on nine screens; the ninth is spelled
differently and nothing notices, because the only check asks whether a screen contains *some*
seed value, never whether the value it shows is the one the record holds. This spec makes a
screen name the record it is showing: a bound element carries `data-record="<entity>[i].<field>"`,
the reference must resolve, the element's text must equal the resolved value, and a
distinctive seed value shown anywhere outside a bound element is refused. Done means a
retyped, misspelled record cannot reach `journey-approved`, and the existing "this journey is
drawn on placeholders" refusal still fires exactly as it does today.
