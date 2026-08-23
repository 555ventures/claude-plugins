# Deviations — specs/20260823/07-deviations-sidecar-backstop.md

- D9 named 7.26.0 as the plugin.json version-bump target, but spec/.claude-plugin/plugin.json
  was already at 7.26.0 at HEAD (specs/20260823/06 landed it first). Bumped to 7.27.0 instead,
  carrying D9's changelog paragraph under the new number — the host's pipeline rules § Gotchas
  covers this exact race: a spec's literal version-bump target is a target, not a pin.
