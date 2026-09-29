// Synthetic host entry point (tests/fixtures/prototype/host — spec 20260928/01 File Plan).
// The one-line dev-only import D3/Behavior requires the driver to find on the worktree side —
// `grep -rl proto-overlay.js` over the worktree (minus node_modules) must find this line.
if (import.meta.env.DEV) import('./proto-overlay.js')

export function main() {
  return 'synthetic prototype fixture host'
}
