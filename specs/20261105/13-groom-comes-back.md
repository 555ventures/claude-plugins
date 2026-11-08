---
date: 2026-11-05
status: done
area: queue
depends_on: []
brief: n/a
architecture: false
breaking: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261105-13-1, AC-20261105-13-2, AC-20261105-13-3, AC-20261105-13-4, AC-20261105-13-5, AC-20261105-13-6, AC-20261105-13-7, AC-20261105-13-8, AC-20261105-13-9]
---

# Groom comes back

## Goal

`/spec:queue groom` works again. The script prints exactly what v7 printed on the same queue data and writes nothing. The session then checks each flagged item with a haiku agent, ticks items with hard evidence and asks about the rest, as v7 did.
