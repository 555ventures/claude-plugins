---
date: 2026-08-15
status: done
diff_base: 97454d27f69e35355a41d950d714e5b8f855536c
open_markers: 0
risk: T3
area: runtime-verification
design: false
breaking: false
depends_on: ["specs/20260815/03-ac-matrix-fail-closed.md"]
depended_on_by: []
spiked: 2026-08-15
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260815-04-1, AC-20260815-04-2, AC-20260815-04-3, AC-20260815-04-4, AC-20260815-04-5, AC-20260815-04-6, AC-20260815-04-7, AC-20260815-04-8]
---

# Runtime leg, shutdown half — observe the stop the leg already signals

## Goal

The runtime leg certifies "this program starts" and is silent on "this program stops
cleanly" — where a long-running service's state-corrupting defects live. Both escape rows in
this repo's ledger name `runtime-leg` as the gate that should have caught them; the stranded
pidfile lock (`wf_1d6e7652-ec3`) rode two CLEAN reviews and blocked the daemon's own restart
(INTAKE JJ-20260815-05). `smoke.sh` already sends the host's declared `runtime.stopSignal` —
but only inside its EXIT trap, where the leg's verdict is already fixed: the signal is spent
and the observation discarded. This spec claims the observation: after readiness, send the
stop signal, require exit within a bounded window with a declared-acceptable status, and
state the shutdown half in the doctrine that argues the boot half. Done = the shutdown
assertion runs before the verdict is fixed, default-action signal death and ignore-the-signal
hangs both fail the leg, declared-inert hosts stay exempt, both intake pin tests run green,
and JJ-20260815-05 is stamped fixed.
