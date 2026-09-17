// SEED copies this file to app/src/journeys.ts verbatim (specs/20260914/01 D4). One journey per
// seed `### <journey-kebab>` block, added here as SCREENS draws it — `mock-review check --json`
// reads this array to resolve each journey's edges against real controls (D6), and this spec's
// `journey-drawn` mark refuses unless every step's `screen`/`beat`/`state` equals the seed's own
// beats verbatim (spec/doctrine/mocks.md § Mocks: State Machine, contract v2).
export type Step = {
  screen: string
  beat: string
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
//     steps: [{ screen: 'home', beat: 'I open the app' }, { screen: 'account', beat: 'I open my account' }],
//     edges: [{ from: 0, to: 1, label: 'Account' }],
//   },
// ]

export const journeys: Journey[] = []
