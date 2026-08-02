/**
 * Build flags injected by webpack DefinePlugin.
 * Dev / normal release: STABLE false (How-to Camera exporters visible).
 * `npm run release:stable`: STABLE true (product cut — no maintainer how-to UI).
 *
 * Keep as a compile-time boolean (not a function) so production minify can
 * dead-code-eliminate How-to UI when stable.
 */
/* global __SCULPTGL_STABLE__ */
var BuildFlags = {
  isStable: typeof __SCULPTGL_STABLE__ !== 'undefined' && !!__SCULPTGL_STABLE__
};

export default BuildFlags;
