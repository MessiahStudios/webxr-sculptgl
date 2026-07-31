/**
 * Honest per-format export payloads — what each format is allowed to carry.
 * Keep UI / dock / roadmap language in sync with these strings.
 */
var ExportFormatInfo = {
  sgl: {
    short: '.sgl — full project',
    detail: 'Native project: geometry, UVs, vertex color & materials, render flags.'
  },
  obj: {
    short: '.obj — geo + UVs',
    detail: 'Geometry + UVs when present; vertex color via #MRGB. No embedded maps — use OBJ+maps.'
  },
  'obj-maps': {
    short: '.obj + maps',
    detail: 'OBJ + MTL + baked diffuse/roughness/metalness PNGs (needs UVs). Alternate textured hand-off beside GLB.'
  },
  ply: {
    short: '.ply — geo ± color',
    detail: 'Geometry and vertex colors only. No UVs or PBR maps.'
  },
  stl: {
    short: '.stl — geo only',
    detail: 'Triangle geometry only. No color, UVs, or materials.'
  },
  glb: {
    short: '.glb — geo + PBR',
    detail: 'Binary glTF: live albedo/metalRough maps when imported or painted; else baked from vertex paint. UV-less → vertex color + factors.'
  },

  label(fmt) {
    var info = ExportFormatInfo[fmt] || ExportFormatInfo.obj;
    return info.short;
  },

  detail(fmt) {
    var info = ExportFormatInfo[fmt] || ExportFormatInfo.obj;
    return info.detail;
  }
};

export default ExportFormatInfo;
