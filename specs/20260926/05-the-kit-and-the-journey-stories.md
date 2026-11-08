---
date: 2026-09-26
status: done
tier: standard
area: genesis
breaking: false
depends_on: [specs/20260926/04-the-design-brief.md]
depended_on_by: [specs/20260926/06-the-approval-stop-and-the-roadmap.md]
brief: 30
spiked: 2026-09-26
build_base: design-retool
open_markers: 0
diff_base: d1a54dd1de7027602dc6960a144fd09da42ee5f7
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260926-05-1, AC-20260926-05-2, AC-20260926-05-3, AC-20260926-05-4, AC-20260926-05-5, AC-20260926-05-6, AC-20260926-05-7, AC-20260926-05-8, AC-20260926-05-9, AC-20260926-05-10, AC-20260926-05-11, AC-20260926-05-12, AC-20260926-05-13, AC-20260926-05-14, AC-20260926-05-15, AC-20260926-05-16, AC-20260926-05-17, AC-20260926-05-18]
---

# The kit and the journey stories

## Goal

After the design brief, genesis lands the design contract as code on the product's real stack:
Fable authors the tokens, the shell and one intent-named composite per pattern row with a fixture
story per declared state, sets Storybook up in the host, and then every approved journey is
rebuilt as a walkable journey story — an app shell, the host's real router in memory mode,
fixtures, and one `step()` per seed beat — drawn from the brief, by Sonnet if the session so
chooses, only after the kit exists and all journeys in one session. The driver derives the beats
each story walks from the seed, builds Storybook's static export at each mark, and refuses a kit
whose composites lack a state story, a journey without its story, a story that does not walk the
seed's beats, or a journey file that imports a primitive. Done means: on a fixture host with a
stub Storybook build, `kit-landed` and `journeys-drawn` refuse and accept for the reasons above,
and HANDOFF stamps brief 27's `design` block from the design paths.
