import { vec3 } from 'gl-matrix';
import Tools from 'editing/tools/Tools';
import TR from 'gui/GuiTR';
import Picking from 'math3d/Picking';
import Enums from 'misc/Enums';
import Utils from 'misc/Utils';
import XRRemoteLog from 'xr/XRRemoteLog';
import AlphaLibrary from 'misc/AlphaLibrary';

var GuiSculptingTools = {};
GuiSculptingTools.tools = [];
var GuiTools = GuiSculptingTools.tools;

GuiSculptingTools.initGuiTools = function (sculpt, menu, main) {
  _sharedAlpha = null;
  // init each tools ui
  for (var i = 0, nbTools = Tools.length; i < nbTools; ++i) {
    if (!Tools[i]) continue;
    var uTool = GuiTools[i];
    if (!uTool) {
      console.error('No gui for tool index : ' + i);
      GuiSculptingTools[i] = {
        _ctrls: [],
        init: function () {}
      };
    }
    uTool.init(sculpt.getTool(i), menu, main);
    GuiSculptingTools.hide(i);
  }
  // Single gallery after all per-tool rows (sits above Common / Symmetry).
  ensureSharedAlphaGallery(menu);
  if (_sharedAlpha) _sharedAlpha.galleryWidget.setVisibility(false);
};

GuiSculptingTools.hide = function (toolIndex) {
  for (var i = 0, ctrls = GuiTools[toolIndex]._ctrls, nbCtrl = ctrls.length; i < nbCtrl; ++i)
    ctrls[i].setVisibility(false);
};

GuiSculptingTools.show = function (toolIndex) {
  for (var i = 0, ctrls = GuiTools[toolIndex]._ctrls, nbCtrl = ctrls.length; i < nbCtrl; ++i)
    ctrls[i].setVisibility(true);
  syncSharedAlphaVisibility(toolIndex);
};

var setOnChange = function (key, factor, val) {
  this[key] = factor ? val / factor : val;
};

// some helper functions
var addCtrlRadius = function (tool, fold, widget, main) {
  var ctrl = fold.addSlider(TR('sculptRadius'), tool._radius, function (val) {
    setOnChange.call(tool, '_radius', 1, val);
    main.getSculptManager().getSelection().setIsEditMode(true);
    main.renderSelectOverRtt();
  }, 5, 500, 1);
  widget._ctrlRadius = ctrl;
  return ctrl;
};
var addCtrlIntensity = function (tool, fold, widget) {
  var ctrl = fold.addSlider(TR('sculptIntensity'), tool._intensity * 100, setOnChange.bind(tool, '_intensity', 100), 0, 100, 1);
  widget._ctrlIntensity = ctrl;
  return ctrl;
};
var addCtrlHardness = function (tool, fold) {
  return fold.addSlider(TR('sculptHardness'), tool._hardness * 100, setOnChange.bind(tool, '_hardness', 100), 0, 100, 1);
};
var addCtrlCulling = function (tool, fold) {
  return fold.addCheckbox(TR('sculptCulling'), tool, '_culling');
};
var addCtrlNegative = function (tool, fold, widget, name) {
  var ctrl = fold.addCheckbox(name || TR('sculptNegative'), tool, '_negative');
  widget.toggleNegative = function () {
    ctrl.setValue(!ctrl.getValue());
  };
  return ctrl;
};

var importAlpha = function () {
  document.getElementById('alphaopen').click();
};

/** One gallery for all sculpt tools (not one copy per tool). */
var _sharedAlpha = null; // { fold, titleWidgets, galleryWidget, root, activeUi }

function setDomVisible(el, visible) {
  if (!el) return;
  el.hidden = !visible;
  el.style.display = visible ? '' : 'none';
}

function paintSharedAlphaGallery() {
  var shared = _sharedAlpha;
  if (!shared || !shared.root) return;
  var ui = shared.activeUi;
  var root = shared.root;
  root.innerHTML = '';
  root.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;padding:2px 0 4px;width:100%;box-sizing:border-box;';

  var noneLabel = AlphaLibrary.getNoneLabel();
  var entries = [{ id: noneLabel, thumb: null, label: noneLabel }];
  var i;
  for (i = 0; i < AlphaLibrary.BUILTIN_ALPHAS.length; ++i) {
    var b = AlphaLibrary.BUILTIN_ALPHAS[i];
    entries.push({ id: b.id, thumb: AlphaLibrary.alphaThumbUrl(b.file), label: b.id });
  }
  var names = Object.keys(Picking.ALPHAS_NAMES || {});
  for (i = 0; i < names.length; ++i) {
    var n = names[i];
    if (n === noneLabel) continue;
    var known = false;
    var j;
    for (j = 0; j < entries.length; ++j) {
      if (entries[j].id === n) { known = true; break; }
    }
    if (!known) entries.push({ id: n, thumb: null, label: n });
  }

  var cur = ui && ui._toolRef ? ui._toolRef._idAlpha : 0;
  cur = AlphaLibrary.normalizeAlphaId(cur);
  if (cur === AlphaLibrary.ALPHA_NONE_ID) cur = noneLabel;

  for (i = 0; i < entries.length; ++i) {
    (function (entry) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.title = entry.label;
      var selected = entry.id === cur;
      btn.style.cssText = 'width:36px;height:36px;padding:2px;border-radius:5px;cursor:pointer;flex:0 0 auto;border:2px solid ' +
        (selected ? '#6af' : '#445') + ';background:#1a1e28;overflow:hidden;box-sizing:border-box;';
      if (entry.thumb) {
        var img = document.createElement('img');
        img.src = entry.thumb;
        img.alt = entry.label;
        img.draggable = false;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;';
        btn.appendChild(img);
      } else {
        btn.textContent = entry.id === noneLabel ? '∅' : entry.label.charAt(0);
        btn.style.color = '#c8d0e8';
        btn.style.fontSize = '11px';
      }
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var val = entry.id === noneLabel ? noneLabel : entry.id;
        var active = _sharedAlpha && _sharedAlpha.activeUi;
        applyAlphaSelection(active && active._toolRef, val, active);
        GuiSculptingTools.refreshAlphaGalleries();
      });
      root.appendChild(btn);
    })(entries[i]);
  }
}

/** Select stamp + default Lock on for non-None (classic stamp behavior). */
function applyAlphaSelection(tool, alphaVal, ui) {
  if (!tool) return;
  var noneLabel = AlphaLibrary.getNoneLabel();
  var isNone = !alphaVal || alphaVal === 0 || alphaVal === '0' ||
    alphaVal === noneLabel ||
    AlphaLibrary.normalizeAlphaId(alphaVal) === AlphaLibrary.ALPHA_NONE_ID;
  tool._idAlpha = isNone ? 0 : alphaVal;
  if (tool._lockPosition === undefined)
    tool._lockPosition = false;
  tool._lockPosition = !isNone;
  if (ui && ui._ctrlAlpha)
    ui._ctrlAlpha.setValue(isNone ? noneLabel : alphaVal);
  if (ui && ui._ctrlLockAlpha)
    ui._ctrlLockAlpha.setValue(!isNone);
}

function ensureSharedAlphaGallery(fold) {
  if (_sharedAlpha) return _sharedAlpha;

  var titleAlpha = fold.addTitle(TR('sculptAlphaTitle'));
  var titleHint = fold.addTitle(TR('sculptAlphaGalleryHint'));
  // yagui Title often has no domContainer — track nodes so we can show/hide with the gallery.
  var titleNodes = [];
  if (titleAlpha && titleAlpha.domText) titleNodes.push(titleAlpha.domText);
  if (titleHint && titleHint.domText) titleNodes.push(titleHint.domText);

  var galleryWidget = {
    setVisibility: function (visible) {
      setDomVisible(this.domContainer, visible);
      for (var i = 0; i < titleNodes.length; ++i)
        setDomVisible(titleNodes[i], visible);
    },
    domContainer: null
  };

  var domLine = fold._addLine ? fold._addLine('') : document.createElement('li');
  if (!fold._addLine && fold.domUl) fold.domUl.appendChild(domLine);
  domLine.className = (domLine.className ? domLine.className + ' ' : '') + 'sculptgl-alpha-gallery';
  domLine.style.height = 'auto';
  domLine.style.minHeight = '22px';
  domLine.style.overflow = 'visible';
  domLine.style.margin = '6px 5px 10px 5px';
  domLine.style.padding = '0';
  domLine.style.position = 'relative';
  domLine.innerHTML = '';

  var root = document.createElement('div');
  domLine.appendChild(root);
  galleryWidget.domContainer = domLine;

  _sharedAlpha = {
    fold: fold,
    titleNodes: titleNodes,
    galleryWidget: galleryWidget,
    root: root,
    activeUi: null
  };
  return _sharedAlpha;
}

function syncSharedAlphaVisibility(toolIndex) {
  if (!_sharedAlpha) return;
  var ui = GuiTools[toolIndex];
  var supports = !!(ui && ui._ctrlAlpha);
  _sharedAlpha.activeUi = supports ? ui : null;
  _sharedAlpha.galleryWidget.setVisibility(supports);
  if (supports) paintSharedAlphaGallery();
}

GuiSculptingTools.refreshAlphaGalleries = function () {
  paintSharedAlphaGallery();
};

var addCtrlAlpha = function (ctrls, fold, tool, ui) {
  // All alpha-capable tools get Lock — gallery defaults it on when a stamp is picked.
  if (tool._lockPosition === undefined)
    tool._lockPosition = false;
  if (tool._alphaAngle === undefined)
    tool._alphaAngle = 0;
  ui._ctrlLockAlpha = fold.addCheckbox(TR('sculptLockPositon'), tool, '_lockPosition');
  ctrls.push(ui._ctrlLockAlpha);

  ctrls.push(fold.addTitle(TR('sculptAlphaAngleHint')));
  ui._ctrlAlphaAngle = fold.addSlider(TR('sculptAlphaAngle'), tool._alphaAngle, function (val) {
    tool._alphaAngle = clampAlphaAngle(val);
    if (ui._ctrlAlphaAngle) ui._ctrlAlphaAngle.setValue(tool._alphaAngle, true);
  }, -360, 360, 1);
  ctrls.push(ui._ctrlAlphaAngle);

  var nudge = {
    ccw: function () { setToolAlphaAngle(tool, ui, (tool._alphaAngle || 0) - 15); },
    cw: function () { setToolAlphaAngle(tool, ui, (tool._alphaAngle || 0) + 15); },
    reset: function () { setToolAlphaAngle(tool, ui, 0); },
    quarter: function () { setToolAlphaAngle(tool, ui, 90); }
  };
  var dualNudge = fold.addDualButton(
    TR('sculptAlphaAngleCCW'),
    TR('sculptAlphaAngleCW'),
    nudge,
    nudge,
    'ccw',
    'cw'
  );
  ctrls.push(dualNudge[0], dualNudge[1]);
  var dualPreset = fold.addDualButton(
    TR('sculptAlphaAngleReset'),
    TR('sculptAlphaAngleQuarter'),
    nudge,
    nudge,
    'reset',
    'quarter'
  );
  ctrls.push(dualPreset[0], dualPreset[1]);

  ui._toolRef = tool;
  ui._ctrlAlpha = fold.addCombobox(TR('sculptAlphaTex'), tool._idAlpha || AlphaLibrary.getNoneLabel(), function (val) {
    applyAlphaSelection(tool, val, ui);
  }, Picking.ALPHAS_NAMES);
  if (ui._ctrlAlpha && ui._ctrlAlpha.domContainer)
    ui._ctrlAlpha.domContainer.style.opacity = '0.85';
  ctrls.push(ui._ctrlAlpha);
  ctrls.push(fold.addButton(TR('sculptImportAlpha'), importAlpha));
};

function clampAlphaAngle(deg) {
  deg = deg === undefined || deg === null || isNaN(deg) ? 0 : deg;
  if (deg > 360) deg = 360;
  if (deg < -360) deg = -360;
  return deg;
}

function setToolAlphaAngle(tool, ui, deg) {
  if (!tool) return;
  tool._alphaAngle = clampAlphaAngle(deg);
  if (ui && ui._ctrlAlphaAngle)
    ui._ctrlAlphaAngle.setValue(tool._alphaAngle, true);
}

function switchSculptTool(main, toolIndex) {
  var gui = main.getGui && main.getGui();
  var sculptGui = gui && gui._ctrlSculpting;
  if (sculptGui && sculptGui._ctrlSculpt)
    sculptGui._ctrlSculpt.setValue(toolIndex);
  else
    main.getSculptManager().setToolIndex(toolIndex);
}

/** Desktop Paint ↔ Soften row — same grouping idea as XR PAINT tab. */
function addPaintSurfaceModeRow(ctrls, fold, main, activeIsSoften) {
  ctrls.push(fold.addTitle(TR('sculptPaintModeTitle')));
  var switcher = {
    goPaint: function () { switchSculptTool(main, Enums.Tools.PAINT); },
    goSoften: function () { switchSculptTool(main, Enums.Tools.SOFTEN); }
  };
  var dual = fold.addDualButton(
    TR('sculptPaintModePaint'),
    TR('sculptPaintModeSoften'),
    switcher,
    switcher,
    'goPaint',
    'goSoften'
  );
  if (dual && dual[0] && dual[1] && dual[0].domButton && dual[1].domButton) {
    dual[activeIsSoften ? 1 : 0].domButton.style.fontWeight = 'bold';
    dual[activeIsSoften ? 0 : 1].domButton.style.opacity = '0.75';
  }
  ctrls.push(dual[0], dual[1]);
}

/** Sync sliders after Paint.applyClayIdealsIfNeeded (desktop panel). */
GuiSculptingTools.onPaintToolSelected = function (main) {
  var tool = main.getSculptManager().getTool(Enums.Tools.PAINT);
  if (!tool || !tool.applyClayIdealsIfNeeded || !tool.applyClayIdealsIfNeeded()) return;
  var materials = GuiTools[Enums.Tools.PAINT] && GuiTools[Enums.Tools.PAINT]._paintMaterials;
  if (materials && materials[1] && materials[2]) {
    materials[1].setValue(Math.round(tool._material[0] * 100), true);
    materials[2].setValue(Math.round(tool._material[1] * 100), true);
  }
  XRRemoteLog.see('DESKTOP', TR('sculptPaintIdealsApplied'), {
    roughness: Math.round(tool._material[0] * 100),
    metallic: Math.round(tool._material[1] * 100)
  });
};

GuiTools[Enums.Tools.BRUSH] = {
  _ctrls: [],
  init: function (tool, fold, main) {
    this._ctrls.push(addCtrlRadius(tool, fold, this, main));
    this._ctrls.push(addCtrlIntensity(tool, fold, this));
    this._ctrls.push(addCtrlNegative(tool, fold, this));
    this._ctrls.push(fold.addCheckbox(TR('sculptClay'), tool, '_clay'));
    this._ctrls.push(fold.addCheckbox(TR('sculptAccumulate'), tool, '_accumulate'));
    this._ctrls.push(addCtrlCulling(tool, fold));
    addCtrlAlpha(this._ctrls, fold, tool, this);
  }
};

GuiTools[Enums.Tools.CREASE] = {
  _ctrls: [],
  init: function (tool, fold, main) {
    this._ctrls.push(addCtrlRadius(tool, fold, this, main));
    this._ctrls.push(addCtrlIntensity(tool, fold, this));
    this._ctrls.push(addCtrlNegative(tool, fold, this));
    this._ctrls.push(addCtrlCulling(tool, fold));
    addCtrlAlpha(this._ctrls, fold, tool, this);
  }
};

GuiTools[Enums.Tools.DRAG] = {
  _ctrls: [],
  init: function (tool, fold, main) {
    this._ctrls.push(addCtrlRadius(tool, fold, this, main));
    addCtrlAlpha(this._ctrls, fold, tool, this);
  }
};

GuiTools[Enums.Tools.FLATTEN] = {
  _ctrls: [],
  init: function (tool, fold, main) {
    this._ctrls.push(addCtrlRadius(tool, fold, this, main));
    this._ctrls.push(addCtrlIntensity(tool, fold, this));
    this._ctrls.push(addCtrlNegative(tool, fold, this));
    this._ctrls.push(addCtrlCulling(tool, fold));
    addCtrlAlpha(this._ctrls, fold, tool, this);
  }
};

GuiTools[Enums.Tools.INFLATE] = {
  _ctrls: [],
  init: function (tool, fold, main) {
    this._ctrls.push(addCtrlRadius(tool, fold, this, main));
    this._ctrls.push(addCtrlIntensity(tool, fold, this));
    this._ctrls.push(addCtrlNegative(tool, fold, this));
    this._ctrls.push(addCtrlCulling(tool, fold));
    addCtrlAlpha(this._ctrls, fold, tool, this);
  }
};

GuiTools[Enums.Tools.PAINT] = {
  _ctrls: [],
  onMaterialChanged: function (main, tool, materials) {
    vec3.copy(tool._color, materials[0].getValue());
    var newR = materials[1].getValue() / 100;
    var newM = materials[2].getValue() / 100;
    if (Math.abs(newR - tool._material[0]) > 1e-4 || Math.abs(newM - tool._material[1]) > 1e-4) {
      if (tool.markPaintUserTweaked) tool.markPaintUserTweaked();
    }
    tool._material[0] = newR;
    tool._material[1] = newM;

    var mesh = main.getMesh();
    if (!mesh) return;

    if (tool._writeAlbedo) mesh.setAlbedo(tool._color);
    if (tool._writeRoughness) mesh.setRoughness(tool._material[0]);
    if (tool._writeMetalness) mesh.setMetallic(tool._material[1]);
    main.render();
  },
  resetMaterialOverride: function (main, tool) {
    if (this._ctrlPicker.getValue() !== tool._pickColor)
      this._ctrlPicker.setValue(tool._pickColor);

    var mesh = main.getMesh();
    if (!mesh || !mesh.getAlbedo) return;

    mesh.getAlbedo()[0] = -1.0;
    mesh.setRoughness(-1.0);
    mesh.setMetallic(-1.0);
    main.render();
  },
  onPickedMaterial: function (materials, tool, main, color, roughness, metallic) {
    main.setCanvasCursor(Utils.cursors.dropper);
    materials[0].setValue(color, true);
    materials[1].setValue(roughness * 100, true);
    materials[2].setValue(metallic * 100, true);
    vec3.copy(tool._color, color);
    tool._material[0] = roughness;
    tool._material[1] = metallic;
    if (tool.markPaintUserTweaked) tool.markPaintUserTweaked();
  },
  onColorPick: function (tool, main, val) {
    tool._pickColor = val;
    main.setCanvasCursor(val ? Utils.cursors.dropper : 'default');
    main._action = val ? Enums.Action.SCULPT_EDIT : Enums.Action.NOTHING;
    main.renderSelectOverRtt();
  },
  init: function (tool, fold, main) {
    addPaintSurfaceModeRow(this._ctrls, fold, main, false);

    this._ctrls.push(addCtrlRadius(tool, fold, this, main));
    this._ctrls.push(addCtrlIntensity(tool, fold, this));
    this._ctrls.push(addCtrlHardness(tool, fold, this));
    this._ctrls.push(addCtrlCulling(tool, fold));

    this._ctrls.push(fold.addTitle(TR('sculptPBRTitle')));
    this._ctrls.push(fold.addTitle(TR('sculptPaintShaderHint')));
    this._ctrls.push(fold.addButton(TR('sculptPaintAll'), tool, 'paintAll'));
    this._ctrlPicker = fold.addCheckbox(TR('sculptPickColor'), tool._pickColor, this.onColorPick.bind(this, tool, main));
    this._ctrls.push(this._ctrlPicker);

    var materials = [];
    var cbMatChanged = this.onMaterialChanged.bind(this, main, tool, materials);
    var ctrlColor = fold.addColor(TR('sculptColor'), tool._color, cbMatChanged);
    var ctrlRoughness = fold.addSlider(TR('sculptRoughness'), tool._material[0] * 100, cbMatChanged, 0, 100, 1);
    var ctrlMetallic = fold.addSlider(TR('sculptMetallic'), tool._material[1] * 100, cbMatChanged, 0, 100, 1);
    materials.push(ctrlColor, ctrlRoughness, ctrlMetallic);
    this._paintMaterials = materials;
    this._ctrls.push(ctrlColor, ctrlRoughness, ctrlMetallic);
    tool.setPickCallback(this.onPickedMaterial.bind(this, materials, tool, main));

    // mask
    this._ctrls.push(fold.addTitle('Write channel'));
    this._ctrls.push(fold.addCheckbox(TR('sculptColor'), tool, '_writeAlbedo'));
    this._ctrls.push(fold.addCheckbox(TR('sculptRoughness'), tool, '_writeRoughness'));
    this._ctrls.push(fold.addCheckbox(TR('sculptMetallic'), tool, '_writeMetalness'));

    window.addEventListener('keyup', this.resetMaterialOverride.bind(this, main, tool));
    window.addEventListener('mouseup', this.resetMaterialOverride.bind(this, main, tool));

    addCtrlAlpha(this._ctrls, fold, tool, this);
  }
};

GuiTools[Enums.Tools.PINCH] = {
  _ctrls: [],
  init: function (tool, fold, main) {
    this._ctrls.push(addCtrlRadius(tool, fold, this, main));
    this._ctrls.push(addCtrlIntensity(tool, fold, this));
    this._ctrls.push(addCtrlNegative(tool, fold, this));
    this._ctrls.push(addCtrlCulling(tool, fold));
    addCtrlAlpha(this._ctrls, fold, tool, this);
  }
};

GuiTools[Enums.Tools.TWIST] = {
  _ctrls: [],
  init: function (tool, fold, main) {
    this._ctrls.push(addCtrlRadius(tool, fold, this, main));
    this._ctrls.push(addCtrlCulling(tool, fold));
    addCtrlAlpha(this._ctrls, fold, tool, this);
  }
};

GuiTools[Enums.Tools.LOCALSCALE] = {
  _ctrls: [],
  init: function (tool, fold, main) {
    this._ctrls.push(addCtrlRadius(tool, fold, this, main));
    this._ctrls.push(addCtrlCulling(tool, fold));
    addCtrlAlpha(this._ctrls, fold, tool, this);
  }
};

GuiTools[Enums.Tools.MOVE] = {
  _ctrls: [],
  init: function (tool, fold, main) {
    this._ctrls.push(addCtrlRadius(tool, fold, this, main));
    this._ctrls.push(addCtrlIntensity(tool, fold, this));
    this._ctrls.push(fold.addCheckbox(TR('sculptTopologicalCheck'), tool, '_topoCheck'));
    this._ctrls.push(addCtrlNegative(tool, fold, this, TR('sculptMoveAlongNormal')));
    addCtrlAlpha(this._ctrls, fold, tool, this);
  }
};

GuiTools[Enums.Tools.SMOOTH] = {
  _ctrls: [],
  init: function (tool, fold, main) {
    this._ctrls.push(addCtrlRadius(tool, fold, this, main));
    this._ctrls.push(addCtrlIntensity(tool, fold, this));
    this._ctrls.push(fold.addCheckbox(TR('sculptTangentialSmoothing'), tool, '_tangent'));
    this._ctrls.push(addCtrlCulling(tool, fold));
    addCtrlAlpha(this._ctrls, fold, tool, this);
  }
};

GuiTools[Enums.Tools.MASKING] = {
  _ctrls: [],
  init: function (tool, fold, main) {
    this._ctrls.push(addCtrlRadius(tool, fold, this, main));
    this._ctrls.push(addCtrlIntensity(tool, fold, this));
    this._ctrls.push(addCtrlHardness(tool, fold, this));
    this._ctrls.push(addCtrlNegative(tool, fold, this));
    this._ctrls.push(addCtrlCulling(tool, fold));
    this._main = main;
    this._tool = tool;
    var bci = fold.addDualButton(TR('sculptMaskingClear'), TR('sculptMaskingInvert'), tool, tool, 'clear', 'invert');
    var bbs = fold.addDualButton(TR('sculptMaskingBlur'), TR('sculptMaskingSharpen'), tool, tool, 'blur', 'sharpen');
    this._ctrls.push(bci[0], bci[1], bbs[0], bbs[1]);
    // mask extract
    this._ctrls.push(fold.addTitle(TR('sculptExtractTitle')));
    this._ctrls.push(fold.addSlider(TR('sculptExtractThickness'), tool, '_thickness', -5, 5, 0.001));
    this._ctrls.push(fold.addButton(TR('sculptExtractAction'), tool, 'extract'));
    addCtrlAlpha(this._ctrls, fold, tool, this);
  }
};

GuiTools[Enums.Tools.SOFTEN] = {
  _ctrls: [],
  init: function (tool, fold, main) {
    addPaintSurfaceModeRow(this._ctrls, fold, main, true);

    this._ctrls.push(addCtrlRadius(tool, fold, this, main));
    this._ctrls.push(addCtrlIntensity(tool, fold, this));
    this._ctrls.push(addCtrlHardness(tool, fold, this));
    this._ctrls.push(addCtrlCulling(tool, fold));
    this._ctrls.push(fold.addTitle('Write channel'));
    this._ctrls.push(fold.addCheckbox(TR('sculptColor'), tool, '_writeAlbedo'));
    this._ctrls.push(fold.addCheckbox(TR('sculptRoughness'), tool, '_writeRoughness'));
    this._ctrls.push(fold.addCheckbox(TR('sculptMetallic'), tool, '_writeMetalness'));
    addCtrlAlpha(this._ctrls, fold, tool, this);
  }
};

GuiTools[Enums.Tools.TRANSFORM] = {
  _ctrls: [],
  init: function () {}
};

export default GuiSculptingTools;
