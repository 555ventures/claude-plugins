# Spike: token lint gate on salon-os (2026-09-23)

## Verdict
189 raw hits / 61 distinct sites across 511 files. Raw colour: 0. Arbitrary value: 27 (24 inside the kit dirs that are already exempt, 3 in app code). Restyle: 162 class hits at 61 sites.
Recommendation: BLOCK now for raw colours and arbitrary values. Restyle must start as WARN with a ratchet.

## Table
| rule | hits (sites) | files | 10-sample: drift / one-off / FP |
|---|---|---|---|
| raw colour | 0 | 0 | none to sample |
| arbitrary (literal) | 19 | 12 (9 in base/ui) | 0 / 1 / 0 |
| arbitrary (token-composed calc/min/color-mix of var) | 8 | 4 (all base/ui) | none sampled (all in the sanctioned base home) |
| restyle of kit component | 162 (61) | 34 | 6 / 1 / 2 |
| **sample total** | | | **6 drift / 2 one-off / 2 FP** |

The 10 samples:
- Drift: 5 Button restyles (broadcast-confirm:368, case-detail:302, candidate-picker:546, selection-bar:59, broadcast-compose:770) and case-detail:241. The 5 Buttons all repeat the same "outline pill" bundle (`rounded-full border-border-strong bg-surface-card text-body-strong text-ink-primary shadow-none`), so a variant is missing. case-detail:241 is `Sheet.Body className="px-5 pb-4"`, which appears 25 times because SheetBody has no default padding.
- One-off: photo-viewer:29 (a full-bleed `Dialog.Popup bg-ink-primary/95`) and filter-chip-row:69 (`[scrollbar-width:none]`).
- False positive: account-menu:141 (`Sheet.Trigger` is a headless part, so there is no kit style to override) and showcase.stories:2233 (stories are already exempt from appearance rules).

Clustering: most hits are in a few files. The top 5 files hold 66 of 189 (35%). Restyle is really 2 repeated patterns: 29 Button sites and 27 Sheet sites.

Top 10 files: broadcast-confirm 19, case-detail 18, candidate-picker 10, consequence-review 10, photo-reframe-sheet 9, base/flow-shell 8, broadcast-compose 8, selection-bar 8, photo-viewer 7, showcase.stories 7.

## Tokens (step 4)
The Tailwind 4 `@theme inline` block in src/styles.css maps design/tokens.css to semantic names: surface-*, ink-*, border-*, accent-*, status-*, chip-*, the type roles (text-body, text-badge, text-label-strong and so on), radius-sm/md/lg/full and shadow-card/float. The drift cases already use tokens. What is missing is a **variant**: Button `outline` uses bg-background/border-border, with no pill or strong-border option, and SheetBody has no padding default. So each fix is "add a cva variant or a kit default", not "swap in a token". No token exists for `scrollbar-width`.

## Tool
- shadcn-lint: 404 on the npm registry. It does not exist.
- eslint-plugin-tailwindcss 4.2.0 is already installed and wired. `no-arbitrary-value` is already `error`, and base/ui are exempt. Gaps, confirmed with a probe file:
  - `bg-red-500 text-slate-400` passes today. The default palette is still registered because @theme has no `--color-*: initial` reset, so `no-custom-classname` accepts it.
  - Arbitrary properties like `[scrollbar-width:none]` are not flagged.
  - It has no restyle concept.
- Because of those gaps I hand-wrote the rule: eslint-rules/token-discipline.js, about 120 lines (copy in this scratchpad). It scans string and template literals in className/class and in cn/cva/clsx/twMerge/tv calls. It takes the utility as the part after the last top-level variant colon, so `data-[...]:` variants do not false-positive. A component counts as kit if it is imported from `@/components/ui` or `@/components/base`.

## Commands and timing
- `pnpm install --frozen-lockfile --prefer-offline` (worktree only): 3.4s
- `pnpm lint` baseline: exit 0, 10.5s wall
- `eslint -c eslint.spike.config.js --no-inline-config -f json src` (rule alone, TS parser, no type info): 1.5s wall across 511 files

## Will agents respect it?
Yes, if it is added to the existing gate. CI runs `pnpm lint` with `--max-warnings 0`. That command is part of `gateCommand` in .claude/spec.config.json, which /spec:run and the .githooks/pre-push hook on main both execute. pre-commit only runs prettier.

The catch is `--max-warnings 0`: any rule set to `warn` breaks the gate. A warn-only ratchet therefore needs a baseline file or a count check outside `pnpm lint`, for example `eslint --rule ... -f json` compared against a stored count. It cannot be a plain `warn`.
