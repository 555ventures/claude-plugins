// SEED copies this file to app/src/journeys.ts verbatim (specs/20260914/01 D4). One journey per
// seed `### <journey-kebab>` block, added here as SCREENS draws it — `mock-review check --json`
// reads this array to resolve each journey's edges against real controls (D6).
// The optional fields are read by the reviewer page shipped in `@555/mock-review` (its journey
// sidebar, command palette and journey conversation) — the plugin itself never reads them, and
// `contract.json` requires only id/title/steps/edges, so a journey may omit all three.
export type Step = {
  screen: string
  state?: string
}

export type Edge = {
  from: number
  to: number
  label?: string
  say?: string
}

export type Journey = {
  id: string
  title: string
  persona?: string
  steps: Step[]
  edges: Edge[]
}

// export const journeys: Journey[] = [
//   {
//     id: 'first-visit',
//     title: 'First visit',
//     steps: [{ screen: 'home' }, { screen: 'account' }],
//     edges: [{ from: 0, to: 1, label: 'Account' }],
//   },
// ]

export const journeys: Journey[] = []
