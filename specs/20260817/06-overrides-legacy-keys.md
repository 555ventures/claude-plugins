---
date: 2026-08-17
status: done
tier: standard
area: autopilot
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: 4a40b4ff88a827dc755cb2fb433d0883c20097c6
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260817-06-1, AC-20260817-06-2, AC-20260817-06-3, AC-20260817-06-4, AC-20260817-06-5]
---

# Overrides file: legacy and annotation keys must not parse as project names

## Goal

A user config written for the pre-0.9.0 direct-Telegram daemon (`botToken`,
`supergroupId`, `allowedUserIds`, `lanes` at top level), or any config using the
JSON-comment convention (`_comment` — the plugin's own `config.example.json` ships one),
currently crashes `autopilotd` at boot with `unknown project "botToken"` and the wrong
remedy (`re-run autopilot discover`). After this spec, retired host keys are ignored with
one warning naming the migration, `_`-prefixed keys are ignored silently, and a genuine
typo still refuses boot exactly as today. Observed live 2026-08-17 on this machine's own
`~/.config/autopilot/config.json`.
