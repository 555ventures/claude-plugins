// SEED copies this file to app/mock.config.ts verbatim (specs/20260914/01 D4). Every field but
// `theme` is set once at SEED and left alone; THEME sets `theme` to the picked candidate's key by
// editing this file directly (specs/20260918/01 D4) — the only line of this file a session ever
// edits. The served page carries no theme-pick control.
export default {
  name: 'app',
  port: 5180,
  targets: {
    viewports: ['360x800', '1280x800'],
    schemes: ['light', 'dark'],
  },
  theme: null,
  client: {
    token: 'replace-me',
  },
}
