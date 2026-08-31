# Deviations — 20260830/03-ci-leg-honest-absence

- D6's literal version-bump target (7.40.0) was stale at build time — the manifest was
  already at 7.42.1 from concurrent specs 01/02. Per this host's recorded gotcha (a spec
  Decision naming a literal version-bump target can be stale by build time; the build bumps
  to the next free version and records the deviation), landed at **7.43.0** instead, with the
  same changelog substance D6 calls for (a line naming the honest ci absence). Satisfies
  AC-20260830-03-6's `≥ 7.40.0` floor.
