---
date: 2026-09-12
status: done
tier: standard
area: design-mocks
design: false
breaking: true
depends_on: [specs/20260912/08-the-register-is-the-whole-shadcn-set.md]
depended_on_by: [specs/20260912/10-seeded-data-names-its-source.md]
brief: n/a
spiked: 2026-09-12
open_markers: 0
build_base: main
diff_base: a6278edc7cfc71b25aa7d8158fca8390ff17a056
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260912-09-1, AC-20260912-09-2, AC-20260912-09-3, AC-20260912-09-4, AC-20260912-09-5, AC-20260912-09-6, AC-20260912-09-7, AC-20260912-09-8]
---

# A mock may not invent

## Goal

Consistency in the mock layer breaks in the override layers, not in the styling choice. Nine
screens measured today carried 18 shared-kit classes, 30 project classes and **50 more invented
inside per-screen `<style>` blocks**; 21 of those classes appeared on exactly one screen, 16
names were defined in two or three layers at once, and `.btn` resolved to six different heights
depending on its ancestor. Nothing refuses any of that. This spec gives the project's own
stylesheet one named home, forbids a screen from carrying styles of its own, forbids that
stylesheet from redefining anything the shared kit already provides, caps its size against the
shared kit's own, and warns on any class that only ever appears on one screen. It also emits
the one number the deferred kit-swap decision reads — what share of the capped project kit is
pure layout. Done means: a screen with a `<style>` rule or a `style=` attribute cannot be
approved, and every run prints the project kit's size, its single-screen classes and its layout
share.
