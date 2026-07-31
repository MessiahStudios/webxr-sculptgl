/**
 * XR "Sculpt Dock" state — palette UI wired to SculptManager.
 * Tools listed here must have an XR stroke/update path (ray or controller-delta).
 */
import Enums from 'misc/Enums';

/** Persist that the artist edited rough/metal in XR (stops clay auto-set). */
function markPaintMaterialTweaked(state) {
  if (state) state.paintParamsUserTweaked = true;
}

/** form / paint = sculpt tools; opts = flags + scene; workspace = artist↔sculpture placement */
export var XR_TABS = ['form', 'paint', 'opts', 'workspace'];

/**
 * Dock chrome labels — keep short.
 * FORM = geometry; PAINT = surface (paint / mask / future blend).
 * Tab id `paint` is distinct from tool key `paint` (same string by design).
 */
export var XR_TAB_LABELS = {
  form: 'FORM',
  paint: 'PAINT',
  opts: 'OPTS',
  workspace: 'SPACE'
};

/**
 * Layout by intent:
 *   form  — geometry deform + Transform (+ smooth / flatten)
 *   paint — surface tools (paint, mask; room for blend)
 *   workspace — spatial relationship (never the mesh itself)
 */
export var XR_TAB_TOOLS = {
  form: ['brush', 'inflate', 'pinch', 'crease', 'drag', 'move', 'twist', 'localscale', 'smooth', 'flatten', 'transform'],
  paint: ['paint', 'masking', 'soften'],
  opts: ['save', 'load', 'import', 'export', 'exportFmt', 'snapshot', 'record', 'recordFps', 'recordQuality', 'clear', 'add', 'undo', 'redo', 'clay', 'symmetry', 'culling'],
  workspace: []
};

/** Legacy dock tab ids (pre Form/Paint rename) → current. */
export function normalizeTabId(tab) {
  if (tab === 'shape') return 'form';
  if (tab === 'surface') return 'paint';
  if (tab === 'view') return 'workspace';
  return tab;
}

/** Always-visible file continuity rows (before paint opts / brush flags). */
export var XR_FILE_OPTS = ['save', 'load', 'import', 'export', 'exportFmt', 'snapshot', 'record', 'recordFps', 'recordQuality'];
export var XR_RECORD_FPS = [15, 24, 30];
export var XR_RECORD_QUALITY = ['small', 'balanced', 'high'];

/**
 * Scene / topology rows.
 * One “ADD …” row: stick X cycles primitive, Y places it (no duplicate “add shape” row).
 */
export var XR_SCENE_OPTS = ['clear', 'add'];

export var XR_ADD_SHAPES = ['sphere', 'cube', 'cylinder', 'torus'];

/** Extra Opts rows when Paint is the active tool (desktop Paint panel parity). */
export var XR_PAINT_OPTS = [
  'eyedropper', 'paintAll', 'picker', 'color', 'hardness', 'roughness', 'metallic',
  'writeAlbedo', 'writeRoughness', 'writeMetalness'
];

/** Soften: channel write + hardness only (no color / eyedropper). */
export var XR_SOFTEN_OPTS = [
  'hardness', 'writeAlbedo', 'writeRoughness', 'writeMetalness'
];

export var XR_EXPORT_FMTS = ['obj', 'obj-maps', 'glb', 'ply', 'stl'];

export var PAINT_COLOR_PRESETS = [
  { name: 'clay', rgb: [1.0, 0.766, 0.336] },
  { name: 'white', rgb: [1.0, 1.0, 1.0] },
  { name: 'black', rgb: [0.06, 0.06, 0.06] },
  { name: 'red', rgb: [0.85, 0.14, 0.12] },
  { name: 'orange', rgb: [0.95, 0.48, 0.12] },
  { name: 'yellow', rgb: [0.95, 0.85, 0.15] },
  { name: 'green', rgb: [0.22, 0.72, 0.28] },
  { name: 'teal', rgb: [0.12, 0.7, 0.7] },
  { name: 'blue', rgb: [0.18, 0.38, 0.92] },
  { name: 'purple', rgb: [0.55, 0.25, 0.78] },
  { name: 'pink', rgb: [0.92, 0.35, 0.6] },
  { name: 'brown', rgb: [0.45, 0.28, 0.16] }
];

export function rgbToHsv(r, g, b) {
  var max = Math.max(r, g, b);
  var min = Math.min(r, g, b);
  var d = max - min;
  var h = 0;
  var s = max === 0 ? 0 : d / max;
  var v = max;
  if (d > 1e-8) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h, s: s, v: v };
}

export function hsvToRgb(h, s, v) {
  var i = Math.floor(h * 6);
  var f = h * 6 - i;
  var p = v * (1 - s);
  var q = v * (1 - f * s);
  var t = v * (1 - (1 - f) * s);
  var r = 0;
  var g = 0;
  var b = 0;
  switch (i % 6) {
  case 0: r = v; g = t; b = p; break;
  case 1: r = q; g = v; b = p; break;
  case 2: r = p; g = v; b = t; break;
  case 3: r = p; g = q; b = v; break;
  case 4: r = t; g = p; b = v; break;
  case 5: r = v; g = p; b = q; break;
  }
  return [r, g, b];
}

export var TOOL_KEY_TO_ENUM = {
  brush: Enums.Tools.BRUSH,
  inflate: Enums.Tools.INFLATE,
  smooth: Enums.Tools.SMOOTH,
  flatten: Enums.Tools.FLATTEN,
  pinch: Enums.Tools.PINCH,
  crease: Enums.Tools.CREASE,
  paint: Enums.Tools.PAINT,
  drag: Enums.Tools.DRAG,
  move: Enums.Tools.MOVE,
  masking: Enums.Tools.MASKING,
  twist: Enums.Tools.TWIST,
  localscale: Enums.Tools.LOCALSCALE,
  transform: Enums.Tools.TRANSFORM,
  soften: Enums.Tools.SOFTEN
};

var ENUM_TO_TOOL_KEY = {};
(function () {
  var k;
  for (k in TOOL_KEY_TO_ENUM) {
    if (Object.prototype.hasOwnProperty.call(TOOL_KEY_TO_ENUM, k))
      ENUM_TO_TOOL_KEY[TOOL_KEY_TO_ENUM[k]] = k;
  }
})();

export function toolKeyFromEnum(idx) {
  return ENUM_TO_TOOL_KEY[idx] || 'brush';
}

export function inferTabForToolKey(toolKey) {
  if (XR_TAB_TOOLS.paint.indexOf(toolKey) >= 0) return 'paint';
  if (TOOL_KEY_TO_ENUM[toolKey] !== undefined) return 'form';
  return 'form';
}

export function isXRReadyTool(toolKey) {
  return TOOL_KEY_TO_ENUM[toolKey] !== undefined;
}

export function getOptsList(state) {
  var core = XR_TAB_TOOLS.opts.slice();
  // File + scene rows already lead XR_TAB_TOOLS.opts; paint opts insert after them.
  var headLen = XR_FILE_OPTS.length + XR_SCENE_OPTS.length;
  if (state.tool === 'paint')
    return XR_FILE_OPTS.concat(XR_SCENE_OPTS).concat(XR_PAINT_OPTS).concat(core.slice(headLen));
  if (state.tool === 'soften')
    return XR_FILE_OPTS.concat(XR_SCENE_OPTS).concat(XR_SOFTEN_OPTS).concat(core.slice(headLen));
  return core;
}

export function nearestPaintPreset(rgb) {
  var best = 0;
  var bestD = Infinity;
  var i;
  for (i = 0; i < PAINT_COLOR_PRESETS.length; ++i) {
    var p = PAINT_COLOR_PRESETS[i].rgb;
    var d = (p[0] - rgb[0]) * (p[0] - rgb[0]) +
      (p[1] - rgb[1]) * (p[1] - rgb[1]) +
      (p[2] - rgb[2]) * (p[2] - rgb[2]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function createXRSculptDockState() {
  var listeners = [];

  var state = {
    mode: 'sculpt',
    tab: 'form',
    tool: 'brush',
    optFocus: 'save',
    radius: 50,
    intensity: 50,
    negative: false,
    clay: true,
    symmetry: true,
    culling: false,
    wireframe: false,
    matcap: 'default',
    exportFmt: 'obj',
    addShape: 'sphere',
    recordFps: 24,
    recordQuality: 'balanced',
    recording: false,

    // Paint (desktop GuiTools PAINT parity)
    paintColorIdx: 0,
    paintColor: PAINT_COLOR_PRESETS[0].rgb.slice(),
    paintPicker: 'swatches', // 'swatches' | 'wheel'
    paintEyedropper: false,
    paintHue: 0.08,
    paintSat: 0.66,
    paintVal: 1.0,
    hardness: 75,
    roughness: 55,
    metallic: 5,
    writeAlbedo: true,
    writeRoughness: true,
    writeMetalness: true,

    subscribe: function (fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    set: function (patch) {
      var key;
      for (key in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, key))
          state[key] = patch[key];
      }
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'tab'))
        state.tab = normalizeTabId(state.tab);
      var i;
      for (i = 0; i < listeners.length; ++i)
        listeners[i](state);
    },

    cycleTab: function (delta) {
      state.tab = normalizeTabId(state.tab);
      var idx = XR_TABS.indexOf(state.tab);
      if (idx < 0) idx = 0;
      idx = (idx + delta + XR_TABS.length) % XR_TABS.length;
      var newTab = XR_TABS[idx];
      if (newTab === 'opts' || newTab === 'workspace') {
        var patch = { tab: newTab };
        if (newTab === 'opts') {
          var opts = getOptsList(state);
          if (opts.indexOf(state.optFocus) < 0)
            patch.optFocus = opts[0];
        }
        state.set(patch);
        return;
      }
      var tools = XR_TAB_TOOLS[newTab];
      var nextTool = state.tool;
      if (tools && tools.length && tools.indexOf(state.tool) < 0)
        nextTool = tools[0];
      state.set({ tab: newTab, tool: nextTool });
    },

    cycleToolInTab: function (delta) {
      if (state.tab === 'opts') {
        var opts = getOptsList(state);
        var oi = opts.indexOf(state.optFocus);
        if (oi < 0) oi = 0;
        oi = (oi + delta + opts.length) % opts.length;
        state.set({ optFocus: opts[oi] });
        return;
      }
      if (state.tab === 'workspace') return;
      var tools = XR_TAB_TOOLS[state.tab];
      if (!tools || !tools.length) return;
      var cur = tools.indexOf(state.tool);
      if (cur < 0) cur = 0;
      cur = (cur + delta + tools.length) % tools.length;
      var next = tools[cur];
      var patch = { tool: next };
      if (next === 'paint' && state.tab === 'opts') {
        // keep paint opts focus valid when landing on paint via other paths
      }
      state.set(patch);
    },

    cyclePaintColor: function (delta) {
      var n = PAINT_COLOR_PRESETS.length;
      var idx = ((state.paintColorIdx || 0) + delta + n) % n;
      var rgb = PAINT_COLOR_PRESETS[idx].rgb.slice();
      var hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      state.set({
        paintColorIdx: idx,
        paintColor: rgb,
        paintHue: hsv.h,
        paintSat: hsv.s,
        paintVal: hsv.v
      });
    },

    togglePaintPicker: function () {
      var next = state.paintPicker === 'wheel' ? 'swatches' : 'wheel';
      var patch = { paintPicker: next };
      // Entering the wheel: never start from near-black (common XR stick/squeeze accident).
      if (next === 'wheel') {
        var v = state.paintVal === undefined ? 1 : state.paintVal;
        if (v < 0.25) {
          patch.paintVal = 1;
          var rgb = hsvToRgb(state.paintHue || 0, state.paintSat || 0.7, 1);
          patch.paintColor = rgb;
          patch.paintColorIdx = nearestPaintPreset(rgb);
          if ((state.paintSat || 0) < 0.08)
            patch.paintSat = 0.7;
        }
      }
      state.set(patch);
    },

    /** Apply HSV → paintColor (wheel mode). Brightness floor avoids accidental black. */
    setPaintHsv: function (h, s, v, opts) {
      var hh = ((h % 1) + 1) % 1;
      var ss = Math.max(0, Math.min(1, s));
      var vv = Math.max(0, Math.min(1, v));
      var floor = (opts && opts.allowDark) ? 0.05 : 0.2;
      if (vv < floor) vv = floor;
      var rgb = hsvToRgb(hh, ss, vv);
      state.set({
        paintHue: hh,
        paintSat: ss,
        paintVal: vv,
        paintColor: rgb,
        paintColorIdx: nearestPaintPreset(rgb)
      });
    },

    nudgePaintWheel: function (dh, ds) {
      state.setPaintHsv(
        (state.paintHue || 0) + dh,
        (state.paintSat || 0) + ds,
        state.paintVal === undefined ? 1 : state.paintVal
      );
    },

    /** Toggle / fire the focused option on the Opts tab. */
    toggleFocusedOption: function () {
      var focus = state.optFocus || 'clay';
      if (focus === 'undo' || focus === 'redo')
        return focus; // dock calls scene.undoXR / redoXR
      if (focus === 'paintAll')
        return 'paintAll'; // dock calls scene.paintAllXR
      if (focus === 'save' || focus === 'load' || focus === 'export' || focus === 'import' || focus === 'snapshot' || focus === 'record')
        return focus; // dock calls scene file helpers / file picker
      if (focus === 'clear' || focus === 'add')
        return focus; // dock calls scene.clearXRScene / addXRShape
      if (focus === 'exportFmt') {
        var fi = XR_EXPORT_FMTS.indexOf(state.exportFmt || 'obj');
        if (fi < 0) fi = 0;
        state.set({ exportFmt: XR_EXPORT_FMTS[(fi + 1) % XR_EXPORT_FMTS.length] });
        return null;
      }
      if (focus === 'recordFps') {
        var fpi = XR_RECORD_FPS.indexOf(state.recordFps || 24);
        if (fpi < 0) fpi = 1;
        state.set({ recordFps: XR_RECORD_FPS[(fpi + 1) % XR_RECORD_FPS.length] });
        return null;
      }
      if (focus === 'recordQuality') {
        var qi = XR_RECORD_QUALITY.indexOf(state.recordQuality || 'balanced');
        if (qi < 0) qi = 0;
        state.set({ recordQuality: XR_RECORD_QUALITY[(qi + 1) % XR_RECORD_QUALITY.length] });
        return null;
      }
      if (focus === 'eyedropper') state.set({ paintEyedropper: !state.paintEyedropper });
      else if (focus === 'clay') state.set({ clay: !state.clay });
      else if (focus === 'symmetry') state.set({ symmetry: !state.symmetry });
      else if (focus === 'culling') state.set({ culling: !state.culling });
      else if (focus === 'writeAlbedo') state.set({ writeAlbedo: !state.writeAlbedo });
      else if (focus === 'writeRoughness') state.set({ writeRoughness: !state.writeRoughness });
      else if (focus === 'writeMetalness') state.set({ writeMetalness: !state.writeMetalness });
      else if (focus === 'picker') state.togglePaintPicker();
      else if (focus === 'color') {
        if (state.paintPicker === 'wheel')
          state.nudgePaintWheel(1 / 24, 0);
        else
          state.cyclePaintColor(1);
      } else if (focus === 'hardness') {
        var h = state.hardness + 5;
        state.set({ hardness: h > 100 ? 0 : h });
      } else if (focus === 'roughness') {
        var r = state.roughness + 5;
        state.set({ roughness: r > 100 ? 0 : r });
        markPaintMaterialTweaked(state);
      } else if (focus === 'metallic') {
        var m = state.metallic + 5;
        state.set({ metallic: m > 100 ? 0 : m });
        markPaintMaterialTweaked(state);
      }
      return null;
    },

    /** Stick X nudge for continuous paint opts (±5). */
    nudgeFocusedOption: function (delta) {
      var focus = state.optFocus || '';
      var step = delta > 0 ? 5 : -5;
      if (focus === 'exportFmt') {
        var fi = XR_EXPORT_FMTS.indexOf(state.exportFmt || 'obj');
        if (fi < 0) fi = 0;
        var next = delta > 0
          ? XR_EXPORT_FMTS[(fi + 1) % XR_EXPORT_FMTS.length]
          : XR_EXPORT_FMTS[(fi - 1 + XR_EXPORT_FMTS.length) % XR_EXPORT_FMTS.length];
        state.set({ exportFmt: next });
        return;
      }
      if (focus === 'recordFps') {
        var fpi = XR_RECORD_FPS.indexOf(state.recordFps || 24);
        if (fpi < 0) fpi = 1;
        var fnext = delta > 0
          ? XR_RECORD_FPS[(fpi + 1) % XR_RECORD_FPS.length]
          : XR_RECORD_FPS[(fpi - 1 + XR_RECORD_FPS.length) % XR_RECORD_FPS.length];
        state.set({ recordFps: fnext });
        return;
      }
      if (focus === 'recordQuality') {
        var qi = XR_RECORD_QUALITY.indexOf(state.recordQuality || 'balanced');
        if (qi < 0) qi = 0;
        var qnext = delta > 0
          ? XR_RECORD_QUALITY[(qi + 1) % XR_RECORD_QUALITY.length]
          : XR_RECORD_QUALITY[(qi - 1 + XR_RECORD_QUALITY.length) % XR_RECORD_QUALITY.length];
        state.set({ recordQuality: qnext });
        return;
      }
      if (focus === 'add') {
        var si = XR_ADD_SHAPES.indexOf(state.addShape || 'sphere');
        if (si < 0) si = 0;
        var snext = delta > 0
          ? XR_ADD_SHAPES[(si + 1) % XR_ADD_SHAPES.length]
          : XR_ADD_SHAPES[(si - 1 + XR_ADD_SHAPES.length) % XR_ADD_SHAPES.length];
        state.set({ addShape: snext });
        return;
      }
      if (focus === 'picker') {
        state.togglePaintPicker();
        return;
      }
      if (focus === 'color') {
        if (state.paintPicker === 'wheel')
          state.nudgePaintWheel(delta * (1 / 24), 0);
        else
          state.cyclePaintColor(delta > 0 ? 1 : -1);
        return;
      }
      if (focus === 'hardness')
        state.set({ hardness: Math.max(0, Math.min(100, state.hardness + step)) });
      else if (focus === 'roughness') {
        state.set({ roughness: Math.max(0, Math.min(100, state.roughness + step)) });
        markPaintMaterialTweaked(state);
      } else if (focus === 'metallic') {
        state.set({ metallic: Math.max(0, Math.min(100, state.metallic + step)) });
        markPaintMaterialTweaked(state);
      }
    }
  };

  // Seed HSV from default clay swatch
  var seed = rgbToHsv(state.paintColor[0], state.paintColor[1], state.paintColor[2]);
  state.paintHue = seed.h;
  state.paintSat = seed.s;
  state.paintVal = seed.v;

  return state;
}

export function syncStateFromSculptManager(state, sculptManager) {
  var tool = sculptManager.getCurrentTool();
  var idx = sculptManager.getToolIndex();
  var tKey = toolKeyFromEnum(idx);
  if (!isXRReadyTool(tKey)) {
    tKey = 'brush';
    sculptManager.setToolIndex(TOOL_KEY_TO_ENUM.brush);
    tool = sculptManager.getCurrentTool();
  }
  var curTab = normalizeTabId(state.tab);
  var patch = {
    tool: tKey,
    tab: (curTab === 'opts' || curTab === 'workspace')
      ? curTab
      : inferTabForToolKey(tKey),
    radius: tool._radius !== undefined ? Math.round(tool._radius) : state.radius,
    intensity: tool._intensity !== undefined ? Math.round(tool._intensity * 100) : state.intensity,
    negative: !!tool._negative,
    clay: tool._clay !== undefined ? !!tool._clay : state.clay,
    culling: tool._culling !== undefined ? !!tool._culling : state.culling,
    symmetry: sculptManager.getSymmetry()
  };
  if (tool._hardness !== undefined)
    patch.hardness = Math.round(tool._hardness * 100);
  if (tool._color) {
    patch.paintColor = [tool._color[0], tool._color[1], tool._color[2]];
    patch.paintColorIdx = nearestPaintPreset(patch.paintColor);
    var hsv = rgbToHsv(patch.paintColor[0], patch.paintColor[1], patch.paintColor[2]);
    patch.paintHue = hsv.h;
    patch.paintSat = hsv.s;
    patch.paintVal = hsv.v;
  }
  if (tool._material) {
    patch.roughness = Math.round(tool._material[0] * 100);
    patch.metallic = Math.round(tool._material[1] * 100);
  }
  if (Object.prototype.hasOwnProperty.call(tool, '_writeAlbedo')) {
    patch.writeAlbedo = !!tool._writeAlbedo;
    patch.writeRoughness = !!tool._writeRoughness;
    patch.writeMetalness = !!tool._writeMetalness;
  }
  if (Object.prototype.hasOwnProperty.call(tool, '_pickColor'))
    patch.paintEyedropper = !!tool._pickColor;
  state.set(patch);
}

export function applyStateToSculptManager(state, scene) {
  var sm = scene.getSculptManager();
  var enumId = TOOL_KEY_TO_ENUM[state.tool];
  if (enumId === undefined) return;

  // Keep desktop sidebar combobox in sync (ignoreCB path via direct index + show/hide).
  if (sm.getToolIndex() !== enumId) {
    var gui = scene.getGui && scene.getGui();
    if (gui && gui._ctrlSculpting && gui._ctrlSculpting._ctrlSculpt) {
      gui._ctrlSculpting._ctrlSculpt.domSelect.value = String(enumId);
      gui._ctrlSculpting.onChangeTool(enumId);
    } else {
      sm.setToolIndex(enumId);
    }
  }

  var t = sm.getCurrentTool();
  if (t._radius !== undefined)
    t._radius = Math.max(5, Math.min(500, state.radius));
  if (t._intensity !== undefined) {
    // Never leave the brush completely dead from an accidental dock nudge.
    t._intensity = Math.max(0.05, Math.min(1, state.intensity / 100));
    if (state.intensity < 5)
      state.intensity = 5;
  }
  if (Object.prototype.hasOwnProperty.call(t, '_negative'))
    t._negative = state.negative;
  if (Object.prototype.hasOwnProperty.call(t, '_clay'))
    t._clay = state.clay;
  if (Object.prototype.hasOwnProperty.call(t, '_culling'))
    t._culling = state.culling;
  if (t._hardness !== undefined)
    t._hardness = Math.max(0, Math.min(1, state.hardness / 100));
  if (t._color && state.paintColor) {
    t._color[0] = state.paintColor[0];
    t._color[1] = state.paintColor[1];
    t._color[2] = state.paintColor[2];
  }
  if (t._material) {
    t._material[0] = Math.max(0, Math.min(1, state.roughness / 100));
    t._material[1] = Math.max(0, Math.min(1, state.metallic / 100));
  }
  if (state.paintParamsUserTweaked && t.markPaintUserTweaked)
    t.markPaintUserTweaked();
  // Chrome-ish dock/tool values → clay ideals until the artist edits R/M.
  if (state.tool === 'paint' && t.applyClayIdealsIfNeeded && t.applyClayIdealsIfNeeded()) {
    state.roughness = Math.round(t._material[0] * 100);
    state.metallic = Math.round(t._material[1] * 100);
  }
  if (Object.prototype.hasOwnProperty.call(t, '_writeAlbedo')) {
    t._writeAlbedo = !!state.writeAlbedo;
    t._writeRoughness = !!state.writeRoughness;
    t._writeMetalness = !!state.writeMetalness;
  }
  if (Object.prototype.hasOwnProperty.call(t, '_pickColor'))
    t._pickColor = !!state.paintEyedropper && state.tool === 'paint';
  sm._symmetry = state.symmetry;
  // Desktop radius uses screen projection; during XR that fights applyXRBrushRadius.
  if (scene.isXRSessionActive && scene.isXRSessionActive()) {
    if (scene.getPicking().getMesh())
      scene.getPicking().applyXRBrushRadius();
  } else {
    scene.getPicking().updateLocalAndWorldRadius2();
  }
}
