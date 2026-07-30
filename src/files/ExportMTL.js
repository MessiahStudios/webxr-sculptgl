/**
 * Wavefront MTL sidecar for OBJ exports (map references when UVs were baked).
 */
var ExportMTL = {};

/**
 * @param {string} baseName file stem without extension (e.g. yourMesh)
 * @param {Array<{name:string, hasMaps:boolean}>} materials
 * @returns {Blob}
 */
ExportMTL.exportMTL = function (baseName, materials) {
  var data = '# WebXR Sculpt / SculptGL material library\n';
  data += '# Maps are baked from vertex paint when UVs exist.\n\n';
  var i;
  for (i = 0; i < materials.length; ++i) {
    var m = materials[i];
    var name = m.name || ('mesh_' + i);
    data += 'newmtl ' + name + '\n';
    data += 'Ka 1 1 1\n';
    data += 'Kd 1 1 1\n';
    data += 'Ks 0.2 0.2 0.2\n';
    data += 'Ns 40\n';
    data += 'd 1\n';
    if (m.hasMaps) {
      data += 'map_Kd ' + baseName + '_' + name + '_diffuse.png\n';
      data += 'map_Pr ' + baseName + '_' + name + '_roughness.png\n';
      data += 'map_Pm ' + baseName + '_' + name + '_metalness.png\n';
      // Common fallbacks some DCC tools look for:
      data += 'map_Ns ' + baseName + '_' + name + '_roughness.png\n';
    }
    data += '\n';
  }
  return new Blob([data], { type: 'text/plain' });
};

export default ExportMTL;
