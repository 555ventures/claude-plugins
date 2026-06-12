# 555-tools

Claude Code plugin marketplace for 555 Ventures projects.

## Install

```
/plugin marketplace add 555ventures/claude-plugins
/plugin install spec@555-tools
```

The repo is private — the machine adding the marketplace needs GitHub access to the
`555ventures` org.

## Plugins

### spec

Spec pipeline: `plan → design → build → review` with deterministic workflows, a
hook-enforced state machine, and per-repo grounding bootstrapped by `/spec:init`.

The plugin ships the **process layer** (commands, workflows, state-gate hook, spec
template); each repo generates its own **grounding layer** by running `/spec:init` once
(`.claude/spec.config.json`, pipeline rules, implementer agents, pattern sweep). The
pipeline commands refuse to run without it.

See [spec/README.md](spec/README.md) for the full flow, recipes, and design decisions.

## Notes for plugin authors

Workflow scripts in this repo guard against two harness behaviors (verified 2026-06-12):

- `Workflow` `args` arrive in the script **JSON-encoded as a string** on both the `name:`
  and `scriptPath:` channels — every script starts with
  `if (typeof args === 'string') args = JSON.parse(args)` plus shape validation.
- Workflow `agent()` resolves only **built-in and plugin** agent types; host
  `.claude/agents/*.md` are invisible to it. Host role doctrine travels through
  `args.doctrines` and dispatches on `general-purpose`.

New workflow scripts need the same prologue and dispatch pattern.
