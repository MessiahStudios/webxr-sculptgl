/**
 * Shared sculpt alpha catalog — Desktop + XR consume the same pack.
 * Stable `id` is the Picking.ALPHAS key (and tool._idAlpha when selected).
 */
import TR from 'gui/GuiTR';

/** Built-in stamps shipped under app/resources/alpha/ */
export var BUILTIN_ALPHAS = [
  { id: 'Soft spot', file: 'softspot.png', category: 'falloff' },
  { id: 'Hard spot', file: 'hardspot.png', category: 'falloff' },
  { id: 'Ring', file: 'ring.png', category: 'falloff' },
  { id: 'Crescent', file: 'crescent.png', category: 'shape' },
  { id: 'Stripes', file: 'stripes.png', category: 'pattern' },
  { id: 'Hatch', file: 'hatch.png', category: 'pattern' },
  { id: 'Dots', file: 'dots.png', category: 'pattern' },
  { id: 'Grit', file: 'grit.png', category: 'organic' },
  { id: 'Ridge', file: 'ridge.png', category: 'organic' },
  { id: 'Crack', file: 'crack.png', category: 'organic' },
  { id: 'Square', file: 'square.jpg', category: 'shape' },
  { id: 'Skin', file: 'skin.jpg', category: 'organic' }
];

export var ALPHA_NONE_ID = 'none';

export function getNoneLabel() {
  return TR('alphaNone') || 'None';
}

/** Paths / display names for Scene.initAlphaTextures (order = gallery order). */
export function getInitAlphaPaths() {
  return BUILTIN_ALPHAS.map(function (a) { return a.file; });
}

export function getInitAlphaNames() {
  return BUILTIN_ALPHAS.map(function (a) { return a.id; });
}

export function alphaThumbUrl(file) {
  return 'resources/alpha/' + file;
}

export function findBuiltinById(id) {
  for (var i = 0; i < BUILTIN_ALPHAS.length; ++i) {
    if (BUILTIN_ALPHAS[i].id === id) return BUILTIN_ALPHAS[i];
  }
  return null;
}

/** Ordered ids for XR stick cycling: None + builtins (+ customs appended by caller). */
export function getGalleryCycleIds(extraNames) {
  var ids = [ALPHA_NONE_ID];
  var i;
  for (i = 0; i < BUILTIN_ALPHAS.length; ++i)
    ids.push(BUILTIN_ALPHAS[i].id);
  if (extraNames && extraNames.length) {
    for (i = 0; i < extraNames.length; ++i) {
      if (ids.indexOf(extraNames[i]) < 0) ids.push(extraNames[i]);
    }
  }
  return ids;
}

export function normalizeAlphaId(id) {
  if (id === undefined || id === null || id === 0 || id === '0') return ALPHA_NONE_ID;
  if (id === ALPHA_NONE_ID) return ALPHA_NONE_ID;
  var noneLabel = getNoneLabel();
  if (id === noneLabel) return ALPHA_NONE_ID;
  return String(id);
}

export function alphaIdForPicking(id) {
  var n = normalizeAlphaId(id);
  if (n === ALPHA_NONE_ID) return getNoneLabel();
  return n;
}

export default {
  BUILTIN_ALPHAS: BUILTIN_ALPHAS,
  ALPHA_NONE_ID: ALPHA_NONE_ID,
  getNoneLabel: getNoneLabel,
  getInitAlphaPaths: getInitAlphaPaths,
  getInitAlphaNames: getInitAlphaNames,
  alphaThumbUrl: alphaThumbUrl,
  findBuiltinById: findBuiltinById,
  getGalleryCycleIds: getGalleryCycleIds,
  normalizeAlphaId: normalizeAlphaId,
  alphaIdForPicking: alphaIdForPicking
};
