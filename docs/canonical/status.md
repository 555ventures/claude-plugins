# status — canonical

Observation is a red alarm, not a certification (specs/20260807/01). v7.0.0 retired
`observe-ci.js` (no new `stage:"observe"` rows are written); `spec-status.js` still derives
`observation: n/a|ok|red` from historical rows; only red renders (🔴 headline, one 📡 line, `/spec:escape` tops
--next as the oracle-shaped entry). The `--pretty` dashboard is bottom-anchored: Roadmap and
detail first, 🎯 Next and the headline verdict are the final lines.
