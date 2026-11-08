---
date: 2026-10-05
status: done
build_base: design-retool
tier: critical
area: design
breaking: false
depends_on: []
brief: 29
spiked: 2026-10-05
open_markers: 0
diff_base: c159a7a89dc9721b7fb150936fb8285ad906bab7
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261005-06-1, AC-20261005-06-2, AC-20261005-06-3, AC-20261005-06-4, AC-20261005-06-5, AC-20261005-06-6, AC-20261005-06-7, AC-20261005-06-8, AC-20261005-06-9, AC-20261005-06-10, AC-20261005-06-11, AC-20261005-06-12, AC-20261005-06-13, AC-20261005-06-14, AC-20261005-06-15, AC-20261005-06-16, AC-20261005-06-17, AC-20261005-06-18]
---

# A project sends pictures of its screens

## Goal

A project that reviews its stories on the hosted service can send one round of pictures of its
real screens, so the client walks the same stories with real screens in place of gray wireframes
and can leave a note on a spot. The plugin names no browser, framework or showcase tool: the
project's config declares the one command that makes its pictures, the plugin tells that command
which pictures the stories need, checks the folder it filled, writes the round and hands it to
the existing sender. Done means: a web, mobile or terminal project sends a round through the same
command, a folder with a missing or stray picture is refused by name, and no stage waits for any
of it.
