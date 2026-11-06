---
description: Set this repo up for spec by detecting its test command and trunk and writing the config
argument-hint: "[notes about the repo]"
allowed-tools: Bash(node *), Read, Grep, Glob, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/init.js`, with `$ARGUMENTS` as hints. `testCommand` is the
whole gate, lint and typecheck included: init chains the ones it finds as real commands in
package.json (`lint`, else `lint:ci`; `typecheck`, else `type-check`), a Makefile (`lint`, `typecheck`
targets) or pyproject (`ruff.toml`, `mypy.ini`) in front of it, also when the user answers the test
command by hand and on a re-run, unless the command already runs the check. A bare eslint, tsconfig,
golangci or clippy config adds nothing. `gate verified` is printed only when `testCommand` exits 0;
any other exit prints `gate not verified` and the exit code. Ask only what the code can't answer: this session asks
the printed `questions` together in ONE AskUserQuestion, then answers with
`init.js --set key=value` (one `--set` per answer).
