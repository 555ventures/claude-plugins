---
date: 2026-09-26
status: done
build_base: design-retool
tier: critical
area: genesis
breaking: true
depends_on: [specs/20260926/03-gates-per-workspace.md]
depended_on_by: [specs/20260926/05-the-kit-and-the-journey-stories.md]
brief: 30
spiked: 2026-09-26
open_markers: 0
diff_base: 26b5c1e7e13d61c4bdc0232a1651666e972f3489
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260926-04-1, AC-20260926-04-2, AC-20260926-04-3, AC-20260926-04-4, AC-20260926-04-5, AC-20260926-04-6, AC-20260926-04-7, AC-20260926-04-8, AC-20260926-04-9, AC-20260926-04-10, AC-20260926-04-11, AC-20260926-04-12, AC-20260926-04-13, AC-20260926-04-14, AC-20260926-04-15, AC-20260926-04-16, AC-20260926-04-17, AC-20260926-04-18, AC-20260926-04-19, AC-20260926-04-20, AC-20260926-04-22, AC-20260926-04-23, AC-20260926-04-21]
---

# The design brief

## Goal

Genesis gains a design stage on the product's real stack. This spec lands its first state:
after the zero-day gate is green and before the roadmap, a web host enters `DESIGN_BRIEF`, where
Fable writes `docs/design/brief.md` (users and context, one jobs-to-be-done line per approved
journey, navigation as task plus frequency, the installed catalog read whole, one composite per
intent with its declared states) and fills the two tables brief 27 asks for in the host's
auto-loaded rules file. The driver generates the catalog inventory, prints the step with a
fresh-session and model line, and verifies the brief and the tables mechanically before it
advances. The gray mock app stops being treated as the product: genesis always picks the stack
and scaffolds, and reads the mock app's approval record for the last time at this state's entry.
Done means: a web-app genesis run on a fixture host stops at `DESIGN_BRIEF`, refuses a brief
that is missing a journey's JTBD line or leaves a rules table empty, and accepts a complete one;
a `data-ml` run passes through untouched.
