# Advisory smell findings — accepted at review
<!-- appended by /spec:review (smell lens); ingested wholesale by the hotspot audit (roadmap brief 05) -->

- 2026-08-12 duplication spec/scripts/hotspot.js:91 duplicates spec/scripts/scope-reconcile.js:64 — hotspot.js defines a private loadConfig() (read .claude/spec.config.json, JSON.parse, catch → {}) byte-for-byte identical to scope-reconcile.js's, left behind by the D17 extraction that deduplicated the neighboring globMatch/BASELINE_GLOBS pair into lib/glob-match.js (spec specs/20260812/02-hotspot-audit.md, runId wf_c4af166d-86f)
