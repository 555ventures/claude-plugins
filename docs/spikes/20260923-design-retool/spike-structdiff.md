# Spike: structural diff as a design-change detector

**Verdict:** padding change CAUGHT, color change CAUGHT, and 0 false changes across 6 no-change runs.

Screen: salon-os Storybook story `showcase-living-showcase--mission-control-daily` (the real MissionControlScreen inside AppShell, with fixture data), 1280x800, 155 elements. Server: `storybook dev` in worktree `spike/structdiff`, which has since been removed.

| Run | Diff entries | Noise |
|---|---|---|
| Padding: `px-4`→`px-5` on the broadcast row `<a>` (line 260) | 8 | 0: 2 are the padding-left/right change on that element, 6 are box shifts of its own children |
| No change, run 1 | 0 | 0 |
| No change, run 2 | 0 | 0 |
| Color: `text-ink-secondary`→`text-ink-primary` on the queue subtitle `<p>` (line 215) | 1 | 0: only `color rgb(86,80,63) -> rgb(36,31,22)` on that `<p>` |
| No change after the color revert | 0 | 0 |
| No change with all mitigations off, x3 | 0 | 0 |

## Setup pain
- `waitUntil: 'networkidle'` never settled on Storybook dev because the HMR socket stays open, so it timed out at 30s. Fix: wait for `load` and then `#storybook-root > *`.
- The first compile is slow (cold Vite). One warm-up capture fixes it.
- Nitro plugin errors appeared in the log because no env is set. They did not affect rendering.
- Mitigations used: kill animations and transitions, wait for `document.fonts.ready`, 150ms settle, `reducedMotion`, fixed timezone and locale, DPR 1. On this screen they turned out to be unnecessary: the raw capture was also 0-noise in 3 of 3 runs.
- Each capture takes about 600–690ms, including the Chromium launch. Edits reached the page through HMR plus a fresh page load, with no restart.

## Scripts
`structsnap.mjs` and `structdiff.mjs` are in this scratchpad. The snapshot is a recursive walk from `#storybook-root` that skips `display:none` and hidden elements. Each element's path is its tag plus its index among siblings of the same tag. For each element it records the integer-rounded box and 27 longhand computed properties. The diff produces one entry per (path, field) that differs.

Commands:
```
pnpm -C <wt> install --frozen-lockfile --prefer-offline
pnpm exec storybook dev -p 6117 --ci --no-open        # background, in <wt>
node structsnap.mjs 'http://localhost:6117/iframe.html?id=showcase-living-showcase--mission-control-daily&viewMode=story' base.json
sed -i '' '260s/ px-4 py-3/ px-5 py-3/' src/components/mission-control-screen.tsx
node structsnap.mjs <url> pad.json && node structdiff.mjs base.json pad.json
```

## Judgment
Good enough as a blocking gate for "nothing changed that shouldn't have" on fixture-driven stories: it was exact, deterministic, and about 0.7s per screen. But it needs a baseline-accept step, because every intended change reports its whole cascade: an early layout change shifts every box after it. So the effective rule is "block on an unexpected diff, accept intended diffs on purpose."

Caveats: this is one screen with no live data, clock, images or animation; the index-based paths break when a list reorders; and a change in the upper layout will flood box entries. It would need grouping by root cause, meaning the diffs on the changed element are shown and the box-only cascades below it are collapsed.
