# Platform notes for the v8 plugin rewrite

Sourced from the official docs on 2026-11-04. Where a point is not in the docs, it is marked **not documented**.

## 1. Plugin layout

Docs: https://code.claude.com/docs/en/plugins/manifest-reference.md and https://code.claude.com/docs/en/plugins/components.md

Standard layout (all paths relative to the plugin root; only `.claude-plugin/plugin.json` lives inside `.claude-plugin/`):

```
my-plugin/
├── .claude-plugin/plugin.json
├── skills/<name>/SKILL.md
├── commands/<name>.md        (older format; prefer skills/ for new plugins)
├── agents/<name>.md
├── hooks/hooks.json
├── bin/                      (added to the Bash tool PATH while enabled)
├── monitors/monitors.json
├── settings.json             (only "agent" and "subagentStatusLine" take effect)
├── .mcp.json
└── .lsp.json
```

**plugin.json.** Only `name` is required. Keep it kebab-case. Other top-level fields include `version` (setting it pins the version), `description`, `author` (object, `name` required), `homepage`, `repository`, `license`, `keywords`, `defaultEnabled`, `dependencies`, `userConfig`, `skills`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`, `outputStyles`, `experimental` (`themes`, `monitors`, `evals`). Unknown top-level keys are stripped with a warning. Component paths must start with `./`. The `skills` key adds to the default `skills/` scan. `commands`, `agents`, and `outputStyles` replace their default scan. Validate with `claude plugin validate ./my-plugin` (add `--strict` in CI).

**marketplace.json.** Lives at `.claude-plugin/marketplace.json` in the marketplace root. Docs: https://code.claude.com/docs/en/plugins/marketplace-reference.md. Required top-level keys: `name`, `owner` (object, `name` required), `plugins` (array). Each plugin entry needs `name` and `source`. A relative source must start with `./`, for example `"source": "./plugins/formatter"`. Object sources include `github` (`repo`, `ref`, `sha`), `url`, `git-subdir`, `npm`, `archive`, and `command`. `strict` defaults to `true`.

**Command frontmatter (commands/*.md).** Command files accept the same frontmatter as skills, except `name` and `paths` (per the skills reference, https://code.claude.com/docs/en/skills.md). The fields this rewrite needs:

- `description`
- `argument-hint` (for example `[issue-number]`)
- `allowed-tools` (space- or comma-separated, or a YAML list)
- `model` (`/model` values or `inherit`)
- `effort` (`low`, `medium`, `high`, `xhigh`, `max`)
- `disable-model-invocation: true` (only the user can run it)
- `context: fork` plus `agent` (run in a forked subagent)

Arguments: `$ARGUMENTS`, `$0`/`$1` (positional), and named `$name` via `arguments`.

**Agent frontmatter (agents/*.md).** Docs: https://code.claude.com/docs/en/sub-agents.md

- `name` (required, at most 256 characters, no `:`)
- `description` (required; Claude uses it to decide when to delegate)
- `tools` (allowlist, comma-separated or YAML list; inherits if omitted)
- `disallowedTools` (denylist, applied first)
- `model`: the aliases `sonnet`, `opus`, `haiku`, `fable`; a full model ID such as `claude-opus-5-5`; or `inherit`
- `effort`: `low`, `medium`, `high`, `xhigh`, `max`
- `isolation: worktree` (the only documented value)
- `maxTurns`, `skills`, `memory`, `background`, `color`
- `permissionMode` is ignored for plugin subagents. `hooks`, `mcpServers`, and `initialPrompt` are also ignored in plugin agents.

Model resolution order: the per-invocation `model` parameter, then frontmatter `model`, then `CLAUDE_CODE_SUBAGENT_MODEL`, then the main conversation's model. The Agent tool's `model` parameter accepts only the four aliases, not full IDs or `inherit`.

**Hooks (hooks/hooks.json).** The file wraps the event map in a top-level `"hooks"` key. Docs: https://code.claude.com/docs/en/hooks.md

Events (33 documented): `SessionStart`, `Setup`, `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Notification`, `MessageDisplay`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`, `Elicitation`, `ElicitationResult`, `SessionEnd`.

Structure is event, then matcher group, then handler:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/format.sh\"", "timeout": 60 }
        ]
      }
    ]
  }
}
```

- Handler `type`: `command`, `http`, `mcp_tool`, `prompt`, or `agent`.
- `timeout` is in seconds. The default is 600 for command, http, and mcp_tool hooks, 30 for prompt, and 60 for agent.
- Command-only fields: `command`, `args` (exec form, no shell), `async`, `asyncRewake`, `shell`, `onFailure`.

**Exit codes.** Exit 0 means success, and stdout is parsed as JSON if it is a single object. Exit 2 is a blocking error: the action stops, and stderr is fed to Claude as the reason. Any other code, including 1, is a non-blocking error, and the action proceeds. The docs say to use `exit 2` for policy enforcement.

**Environment variables.** `${CLAUDE_PLUGIN_ROOT}` is the install path and changes on update. `${CLAUDE_PLUGIN_DATA}` survives updates. `${CLAUDE_PROJECT_DIR}` is the project root. Substitution happens inline in hook commands, MCP and LSP config, and skill, command, and agent Markdown. The variables are **not** present in the environment of commands the Bash tool runs. Quote the path in shell-form hooks, or use `args` (exec form).

## 2. Parallel and isolated subagents from a command

Docs: https://code.claude.com/docs/en/sub-agents.md and https://code.claude.com/docs/en/worktrees.md

- A command can dispatch subagents by name. Give each one its own `model` and `effort` in its agent frontmatter. A per-invocation `model` parameter on the Agent tool call overrides the frontmatter. The Agent tool's `model` parameter takes aliases only.
- Parallel: the docs say that for independent investigations, you can spawn several subagents to work simultaneously. Background subagents run concurrently, and each spends its own tokens. Results return to the main conversation.
- `isolation: worktree` in agent frontmatter, or `isolation` on the Agent call, runs the subagent in a temporary git worktree. It branches from the default branch (`worktree.baseRef` defaults to `"fresh"`; `"head"` branches from current HEAD). It is removed automatically if the subagent makes no changes. Changes otherwise stay on disk until the periodic sweep.
- `EnterWorktree` / `ExitWorktree`: these are session tools. Claude calls `EnterWorktree` to move the session into a worktree under `.claude/worktrees/`. The CLI equivalent is `claude --worktree <name>` (or `-w`). The worktrees page does not document the tool's parameters in detail. Check `/doc` or the tools reference before depending on them.
- Env caps (documented):
  - `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`: limit on concurrently running subagents. Default 20. Requires v2.1.217 or later. Excess spawns fail with `Concurrent subagent limit reached`.
  - `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`: nesting layers below the main conversation. Default 3. Set `1` to disable nesting.
- The `run_in_background` parameter on the Agent tool is **not documented** in the pages reviewed.

## 3. Hook patterns

**Stop hook: tests must pass before finishing.** The docs describe a Stop hook that exits 2 to keep Claude working, and a JSON form `{"decision": "block", "reason": "..."}`. Stop input has `stop_hook_active`; the SubagentStop docs say that field is present, but its exact semantics for Stop were not confirmed in the pages I read. A block cap exists: after eight consecutive blocks with no tool call between them, Claude Code overrides the next block. Raise it with `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` (per the best-practices page).

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/require-tests.sh\"", "timeout": 600 }
        ]
      }
    ]
  }
}
```

`require-tests.sh` runs the suite. On failure it writes output to stderr and exits 2.

**onFailure: block: not for Stop.** `onFailure` exists on command and http hooks (requires v2.1.295 or later). Values are `"continue"` or `"block"`. It converts crashes, timeouts, and bad output into a block. The docs say it has **no effect on `Stop`, `SubagentStop`, `TaskCompleted`, `TeammateIdle`, or async hooks**. A Stop hook that crashes therefore does not block by this field. Make the script itself exit 2 on failure.

**PreToolUse: block destructive commands.** Exit 2 with the reason on stderr, or print JSON:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Destructive command blocked by hook"
  }
}
```

Valid `permissionDecision` values: `allow`, `deny`, `ask`, `defer`. When hooks disagree, `deny` beats `defer`, which beats `ask`, which beats `allow`. Matcher: `"matcher": "Bash"`. Narrow it with `if` (permission rule syntax, for example `"if": "Bash(rm *)"`). `updatedInput` can rewrite tool arguments. Hooks are deterministic; a `prompt` or `agent` hook is a model judgment and is not deterministic.

## 4. `claude plugin eval`

Docs: https://code.claude.com/docs/en/plugin-evals.md. Requires Claude Code v2.1.269 or later.

Layout inside the plugin:

```
evals/
├── <case>/
│   ├── prompt.md          (frontmatter fields + prompt body)
│   ├── case.yaml          (optional; needs schema_version "1.1" and name)
│   └── graders/<name>.md  (frontmatter `type` + options; body is the rubric)
├── mocks/<server>/<tool>.md
└── results/<timestamp>/   (aggregate-result.json, report.html)
```

`prompt.md` frontmatter: `name`, `description`, `tags`, `plugins`, `runs` (default 3), `model`, `max_turns` (default 10), `timeout_seconds` (default 300), `allowed_tools`, `append_system_prompt`, `env` (keys must match `EVAL_*`).

Grader types: `regex` (`pattern`, `flags`, `match`, `target`), `tool_used` (`tool`, `input_match`, `min`, `max`), `tool_order` (`before`, `after`), `file_exists` (`path`, `exists`), `llm` (`criteria`, `focus`, two of three votes), `baseline` (`baseline_file`, `criteria`). Grader frontmatter also takes `weight` and `arm`.

Commands:

- `claude plugin eval init` (interactive). `claude plugin eval init --bare first-case` writes a blank case, which is the path for CI.
- `claude plugin eval .` runs every case with the plugin loaded.
- Useful flags: `--case <glob>`, `--tag`, `--runs`, `--model`, `--judge-model`, `--threshold` (default 1.0), `--max-cost-usd`, `--allow-tools`, `--ablation none|with-without`, `--mocks record|off`, `--trust-plugin`, `--json [file.json]`, `--no-publish`, `-j/--concurrency` (1 to 8).

CI example from the docs:

```bash
claude plugin eval . --trust-plugin --json results.json --threshold 0.8 \
  --model claude-sonnet-5-5 --judge-model claude-haiku-5-5 --no-publish --max-cost-usd 20
```

Results: `aggregate-result.json` (same document `--json` prints) with `schemaVersion: 1`, camelCase fields, and `aggregates.overallScore`, `aggregates.casesPassed`, `aggregates.casesTotal`, `aggregates.meanDelta`, plus `cases[].arms.with[]` and `cases[].arms.without[]`. Read fields and ignore unknown ones.

Exit codes: 0 passed; 1 below threshold, load error, no cases, or runs not started; 2 partial (cost ceiling or auth rejected); 130 interrupted; 143 terminated.

Sandbox: each run is a `claude -p` child with a temporary home and working directory, and only the plugin under test loaded. The user's settings, hooks, CLAUDE.md, and other plugins are not loaded. Bash, Write, Edit, WebFetch, and WebSearch are removed unless granted with `--allow-tools`. When Bash is granted, it runs under the OS sandbox. The docs say this is not a security boundary for the plugin's own hooks and code. Trust prompt: the first run in an untrusted directory asks for trust. Use `--trust-plugin` in CI.

## 5. Model IDs and effort

Docs: https://platform.claude.com/docs/en/models/overview.md, https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions.md, https://platform.claude.com/docs/en/build-with-claude/effort.md

| Model | API ID | Alias (Claude Code) | Default effort | API price (input / output per MTok) |
|---|---|---|---|---|
| Claude Fable 5.1 | `claude-fable-5-1` | `fable` | `high` | $10 / $50 |
| Claude Opus 5.5 | `claude-opus-5-5` | `opus` | `medium` | $4 / $20 |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | `sonnet` | `high` | $2 / $10 |
| Claude Haiku 5.5 | `claude-haiku-5-5` | `haiku` | `medium` | from $0.10 / $0.50 |

- Dateless IDs like `claude-opus-5-5` are pinned snapshots, not evergreen pointers.
- Context: 1M tokens. Max output: 128K tokens (synchronous).
- Effort levels for these four models: `low`, `medium`, `high`, `xhigh`, `max`. Levels above what a model supports round down to the highest supported level.
- The API sets `output_config.effort` on the request.

Claude Code settings:

- Per-subagent: `effort` in agent frontmatter. Per-invocation `effort` on the Agent tool (v2.1.292 or later) overrides it.
- Session: `/effort <level>`, `/effort auto`, or `/effort status`.
- `effortLevel` in settings accepts `low`, `medium`, `high`, `xhigh`, not `max`.
- `CLAUDE_CODE_EFFORT_LEVEL` accepts `max`. It takes precedence over frontmatter and settings.
- Model override: `ANTHROPIC_DEFAULT_*_MODEL` env vars and the `model` setting (see https://code.claude.com/docs/en/model-config.md).

## 6. Headless mode and a comparison harness

Docs: https://code.claude.com/docs/en/headless.md

```bash
claude --bare -p "Summarize README.md" --allowedTools "Read" --model claude-sonnet-5-5 --output-format json
```

- `-p` / `--print` runs non-interactively. Exit code is 0 on success and non-zero on failure.
- `--bare` skips auto-discovery of hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory, and CLAUDE.md. Load what you need with flags: `--plugin-dir <path>`, `--mcp-config`, `--agents`, `--settings`, `--append-system-prompt`. Bare mode never reads OAuth or keychain credentials, so set `ANTHROPIC_API_KEY` (or use an `apiKeyHelper` in `--settings`). The docs recommend `--bare` for scripts and CI.
- `--output-format`: `text` (default), `json` (adds `result`, `session_id`, `total_cost_usd`), `stream-json`. `--json-schema` returns `structured_output`.
- Permissions: `--allowedTools`, `--permission-mode` (`auto`, `dontAsk`, `acceptEdits`, and others), `--permission-prompts none` for unattended runs (v2.1.259 or later).
- Continue: `--continue` or `--resume <session_id>`.
- Slash commands and skills work in `-p` if the prompt includes `/skill-name`.
- Plugin health in CI: the `system/init` event lists `plugins` and `plugin_errors`.

For an A/B harness, run the same prompt once with `--plugin-dir` and once bare with no plugin, and compare `result` and `total_cost_usd`. The docs do not describe a built-in A/B flag. `claude plugin eval` with `--ablation with-without` already provides this.

## 7. Best-practices guidance

Docs: https://code.claude.com/docs/en/best-practices.md, https://code.claude.com/docs/en/memory.md

- **Keep CLAUDE.md short.** It loads every session, so keep only what Claude cannot work out from the code. The memory guide recommends staying under 200 lines. Do not describe directory layouts or tech stacks; `/init` output is a starting point, and the work is mostly deletion.
- **Emphasis.** Adding IMPORTANT or ALL CAPS usually makes Claude over-apply a rule. Current models follow a plainly worded line.
- **Zero-exception rules go in hooks, deny rules, or managed settings.** Guidelines with exceptions stay in CLAUDE.md. The docs say that if you keep adding emphasis to a CLAUDE.md line, it belongs in a hook.
- **Skills load on demand.** Descriptions are in context every turn. Bodies load only on invocation and stay in context afterward. Keep each `SKILL.md` under 500 lines and move detail into supporting files. The `description` plus `when_to_use` text is truncated at 1,536 characters in the listing, so put the trigger first. `disable-model-invocation: true` removes the description from context.
- **Plugin instructions.** A `CLAUDE.md` at a plugin root is not loaded, and `claude plugin validate` warns about it. Put plugin instructions in a skill.
- **Subagents for context isolation.** Ask subagents for short summaries back.

## Open items (not in the docs I reviewed)

- The `run_in_background` parameter on the Agent tool.
- Whether `stop_hook_active` is documented for the Stop event with a stable meaning.
- The exact parameters of `EnterWorktree`.
- Whether the plugin-eval docs and this file need re-checking before the release. The eval command is labelled generally available, but the docs page was only partly read.
- The `plugins/plugin-evals` URL in the docs map returned 404. The page is served at https://code.claude.com/docs/en/plugin-evals.md.
