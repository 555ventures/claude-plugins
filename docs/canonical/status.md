# status — canonical

Observation is a red alarm, not a certification (specs/20260807/01): `observe-ci.js` checks
the default branch's latest completed run once per invocation, attributes a red run to the
latest-closing done spec whose close commit it contains (ancestry), and appends one red row;
a later green run appends a clearing row. Everything else — unavailable CI, in-progress
runs, healthy branches — is silent and writes nothing. `spec-status.js` derives
`observation: n/a|ok|red`; only red renders (🔴 headline, one 📡 line, `/spec:escape` tops
--next as the oracle-shaped entry). The `--pretty` dashboard is bottom-anchored: Roadmap and
detail first, 🎯 Next and the headline verdict are the final lines.
