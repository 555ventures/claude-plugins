---
date: 2026-09-12
status: done
build_base: main
tier: standard
area: design
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-12
open_markers: 0
diff_base: 726ad6297196de94fed28242f85777b82e87d937
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260912-14-1, AC-20260912-14-2, AC-20260912-14-3, AC-20260912-14-4, AC-20260912-14-5, AC-20260912-14-6, AC-20260912-14-7, AC-20260912-14-8, AC-20260912-14-9]
---

# The design stage prints the work, not the inventory

## Goal

`design-atlas.js check` and `mocks-driver.js notes open` print output proportional to how
big the project is, not to what is wrong with it. A check run over a 6-screen fixture with a
kit family spends 1,811 bytes on 13 lines, of which one line is the verdict and twelve are a
per-screen inventory that repeats verbatim on every run; the same shape at 500 screens is
tens of kilobytes, and the check runs many times in a design session. `notes open` reprints
every question the project has ever answered, forever, plus every open note however many
there are. Done means: both commands print the verdict, the counts that are decided against,
and everything that is actually wrong — the per-screen detail and the full history stay
reachable behind one flag each, byte-identical to today's output. No consumer, gate, refusal
or served page changes behavior.
