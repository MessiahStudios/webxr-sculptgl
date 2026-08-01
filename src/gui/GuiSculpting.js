import TR from 'gui/GuiTR';
import Enums from 'misc/Enums';
import Tools from 'editing/tools/Tools';
import getOptionsURL from 'misc/getOptionsURL';
import GuiSculptingTools from 'gui/GuiSculptingTools';
import XRRemoteLog from 'xr/XRRemoteLog';
import { XR_TAB_TOOLS, TOOL_KEY_TO_ENUM } from 'xr/XRSculptDockState';

var GuiTools = GuiSculptingTools.tools;

function toolIconUrl(key) {
  return 'resources/tool-icons/' + key + '.png';
}

/** Short caption under icon (sidebar-friendly). */
function toolIconCaption(key) {
  if (key === 'localscale') return TR('sculptLocalScaleShort') || 'Scale';
  if (key === 'soften') return TR('sculptSoftenShort') || 'Blend';
  if (key === 'masking') return TR('sculptMaskingShort') || 'Mask';
  var enumId = TOOL_KEY_TO_ENUM[key];
  if (enumId === undefined || !Tools[enumId]) return key;
  var full = TR(Tools[enumId].uiName);
  // Drop shortcut suffixes: "Smooth (-Shift)" → "Smooth"
  return String(full).replace(/\s*\([^)]*\)\s*$/, '');
}

/** Build flat enum→label map for yagui (needs Array so getValue() parseInt works). */
function buildToolOptionLabels() {
  var optTools = [];
  var keys = XR_TAB_TOOLS.form.concat(XR_TAB_TOOLS.paint);
  var i;
  for (i = 0; i < keys.length; ++i) {
    var enumId = TOOL_KEY_TO_ENUM[keys[i]];
    if (enumId === undefined || !Tools[enumId]) continue;
    optTools[enumId] = TR(Tools[enumId].uiName);
  }
  return optTools;
}

/**
 * Replace flat yagui options with Form / Paint <optgroup>s.
 * Children match XR FORM/PAINT tool lists; option values stay Enums.Tools indices.
 */
function applyFormPaintOptgroups(domSelect) {
  if (!domSelect) return;
  while (domSelect.firstChild)
    domSelect.removeChild(domSelect.firstChild);

  var groups = [
    { labelKey: 'sculptGroupForm', keys: XR_TAB_TOOLS.form },
    { labelKey: 'sculptGroupPaint', keys: XR_TAB_TOOLS.paint }
  ];
  var g;
  for (g = 0; g < groups.length; ++g) {
    var og = document.createElement('optgroup');
    og.label = TR(groups[g].labelKey);
    var keys = groups[g].keys;
    var i;
    for (i = 0; i < keys.length; ++i) {
      var enumId = TOOL_KEY_TO_ENUM[keys[i]];
      if (enumId === undefined || !Tools[enumId]) continue;
      var opt = document.createElement('option');
      opt.value = String(enumId);
      opt.textContent = TR(Tools[enumId].uiName);
      og.appendChild(opt);
    }
    domSelect.appendChild(og);
  }
}

/**
 * Desktop Form / Paint icon grids (same kids as XR dock).
 * Combobox stays in DOM (hidden) so hotkeys / setValue keep working.
 */
function buildToolIconGrids(fold, onPick) {
  var wrapLine = fold._addLine ? fold._addLine('') : document.createElement('li');
  if (!fold._addLine && fold.domUl) fold.domUl.appendChild(wrapLine);
  wrapLine.className = (wrapLine.className ? wrapLine.className + ' ' : '') + 'sculptgl-tool-icons';
  wrapLine.style.height = 'auto';
  wrapLine.style.minHeight = '22px';
  wrapLine.style.overflow = 'visible';
  wrapLine.innerHTML = '';

  var root = document.createElement('div');
  root.className = 'sculptgl-tool-icons-root';
  wrapLine.appendChild(root);

  var buttonsByEnum = {};

  function addGroup(title, keys, accentClass) {
    var section = document.createElement('div');
    section.className = 'sculptgl-tool-icons-section ' + accentClass;
    var h = document.createElement('div');
    h.className = 'sculptgl-tool-icons-heading';
    h.textContent = title;
    section.appendChild(h);
    var grid = document.createElement('div');
    grid.className = 'sculptgl-tool-icons-grid';
    var i;
    for (i = 0; i < keys.length; ++i) {
      (function (key) {
        var enumId = TOOL_KEY_TO_ENUM[key];
        if (enumId === undefined || !Tools[enumId]) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sculptgl-tool-icon-btn';
        btn.dataset.toolEnum = String(enumId);
        btn.dataset.toolKey = key;
        btn.title = TR(Tools[enumId].uiName);
        var img = document.createElement('img');
        img.src = toolIconUrl(key);
        img.alt = toolIconCaption(key);
        img.draggable = false;
        btn.appendChild(img);
        var cap = document.createElement('span');
        cap.className = 'sculptgl-tool-icon-cap';
        cap.textContent = toolIconCaption(key);
        btn.appendChild(cap);
        btn.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          onPick(enumId);
        });
        grid.appendChild(btn);
        buttonsByEnum[enumId] = btn;
      })(keys[i]);
    }
    section.appendChild(grid);
    root.appendChild(section);
  }

  addGroup(TR('sculptGroupForm'), XR_TAB_TOOLS.form, 'is-form');
  addGroup(TR('sculptGroupPaint'), XR_TAB_TOOLS.paint, 'is-paint');

  return {
    domContainer: wrapLine,
    buttonsByEnum: buttonsByEnum,
    setSelected: function (toolIndex) {
      var k;
      for (k in buttonsByEnum) {
        if (!Object.prototype.hasOwnProperty.call(buttonsByEnum, k)) continue;
        var on = (k | 0) === (toolIndex | 0);
        buttonsByEnum[k].classList.toggle('is-selected', on);
        buttonsByEnum[k].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }
  };
}

class GuiSculpting {

  constructor(guiParent, ctrlGui) {
    this._main = ctrlGui._main; // main application
    this._ctrlGui = ctrlGui; // main gui
    this._sculptManager = ctrlGui._main.getSculptManager(); // sculpting management
    this._toolOnRelease = -1; // tool to apply when the mouse or the key is released
    this._invertSign = false; // invert sign of tool (add/sub)

    this._modalBrushRadius = false; // modal brush radius change
    this._modalBrushIntensity = false; // modal brush intensity change

    // modal stuffs (not canvas based, because no 3D picking involved)
    this._lastPageX = 0;
    this._lastPageY = 0;
    // for modal radius
    this._refX = 0;
    this._refY = 0;

    this._menu = null;
    this._ctrlSculpt = null;
    this._toolIconGrid = null;
    this._ctrlSymmetry = null;
    this._ctrlContinuous = null;
    this._ctrlTitleCommon = null;
    this.init(guiParent);
  }

  init(guiParent) {
    var menu = this._menu = guiParent.addMenu(TR('sculptTitle'));
    menu.open();

    var optTools = buildToolOptionLabels();
    var initialTool = this._sculptManager.getToolIndex();
    // Keep combobox for hotkeys / getValue / setValue — hide visually; icons are primary.
    this._ctrlSculpt = menu.addCombobox('', initialTool, this.onChangeTool.bind(this), optTools);
    applyFormPaintOptgroups(this._ctrlSculpt.domSelect);
    this._ctrlSculpt.domSelect.value = String(initialTool);
    if (this._ctrlSculpt.domContainer)
      this._ctrlSculpt.domContainer.classList.add('sculptgl-tool-select-hidden');
    else if (this._ctrlSculpt.domSelect) {
      var hideEl = this._ctrlSculpt.domSelect.closest
        ? this._ctrlSculpt.domSelect.closest('li')
        : this._ctrlSculpt.domSelect.parentElement;
      if (hideEl) hideEl.classList.add('sculptgl-tool-select-hidden');
    }
    var self = this;
    this._toolIconGrid = buildToolIconGrids(menu, function (enumId) {
      self._ctrlSculpt.setValue(enumId);
    });
    this._toolIconGrid.setSelected(initialTool);

    GuiSculptingTools.initGuiTools(this._sculptManager, this._menu, this._main);

    this._ctrlTitleCommon = menu.addTitle(TR('sculptCommon'));
    // symmetry
    this._ctrlSymmetry = menu.addCheckbox(TR('sculptSymmetry'), this._sculptManager._symmetry, this.onSymmetryChange.bind(this));
    // continuous
    this._ctrlContinuous = menu.addCheckbox(TR('sculptContinuous'), this._sculptManager, '_continuous');

    GuiSculptingTools.show(this._sculptManager.getToolIndex());
    this.addEvents();
    this.onChangeTool(this._sculptManager.getToolIndex());
  }

  onSymmetryChange(value) {
    this._sculptManager._symmetry = value;
    this._main.render();
  }

  addEvents() {
    var cbLoadAlpha = this.loadAlpha.bind(this);
    document.getElementById('alphaopen').addEventListener('change', cbLoadAlpha, false);
    this.removeCallback = function () {
      document.getElementById('alphaopen').removeEventListener('change', cbLoadAlpha, false);
    };
  }

  removeEvents() {
    if (this.removeCallback) this.removeCallback();
  }

  getSelectedTool() {
    return this._ctrlSculpt.getValue() | 0;
  }

  releaseInvertSign() {
    if (!this._invertSign)
      return;
    this._invertSign = false;
    var tool = GuiTools[this.getSelectedTool()];
    if (tool.toggleNegative)
      tool.toggleNegative();
  }

  onChangeTool(newValue) {
    newValue = newValue | 0; // force number (HTML <select> / yagui can yield strings)
    GuiSculptingTools.hide(this._sculptManager.getToolIndex());
    this._sculptManager.setToolIndex(newValue);
    GuiSculptingTools.show(newValue);

    var showContinuous = this._sculptManager.canBeContinuous() === true;
    this._ctrlContinuous.setVisibility(showContinuous);

    var showSym = newValue !== Enums.Tools.TRANSFORM;
    this._ctrlSymmetry.setVisibility(showSym);

    this._ctrlTitleCommon.setVisibility(showContinuous || showSym);

    this._main.getPicking().updateLocalAndWorldRadius2();

    if (newValue === Enums.Tools.PAINT)
      GuiSculptingTools.onPaintToolSelected(this._main);

    if (this._toolIconGrid)
      this._toolIconGrid.setSelected(newValue);

    if (!(this._main.isXRSessionActive && this._main.isXRSessionActive())) {
      var ui = (Tools[newValue] && Tools[newValue].uiName) || String(newValue);
      XRRemoteLog.see('DESKTOP', 'Tool → ' + ui, { toolIndex: newValue });
    }
  }

  loadAlpha(event) {
    if (event.target.files.length === 0)
      return;

    var file = event.target.files[0];
    if (!file.type.match('image.*'))
      return;

    var reader = new FileReader();
    var main = this._main;
    var tool = GuiTools[this._sculptManager.getToolIndex()];

    reader.onload = function (evt) {
      var img = new Image();
      img.src = evt.target.result;
      img.onload = main.onLoadAlphaImage.bind(main, img, file.name || 'new alpha', tool);
    };

    document.getElementById('alphaopen').value = '';
    reader.readAsDataURL(file);
  }

  addAlphaOptions(opts) {
    for (var i = 0, nbTools = GuiTools.length; i < nbTools; ++i) {
      var gTool = GuiTools[i];
      if (gTool && gTool._ctrlAlpha) gTool._ctrlAlpha.addOptions(opts);
    }
    if (GuiSculptingTools.refreshAlphaGalleries)
      GuiSculptingTools.refreshAlphaGalleries();
  }

  updateMesh() {
    this._menu.setVisibility(!!this._main.getMesh());
  }

  _startModalBrushRadius(x, y) {
    this._refX = x;
    this._refY = y;
    var cur = GuiTools[this.getSelectedTool()];
    if (cur._ctrlRadius) {
      var rad = cur._ctrlRadius.getValue();
      this._refX -= rad;
      this._main.getSculptManager().getSelection().setOffsetX(-rad * this._main.getPixelRatio());
      this._main.renderSelectOverRtt();
    }
  }

  _checkModifierKey(event) {
    var selectedTool = this.getSelectedTool();

    if (this._main._action === Enums.Action.NOTHING) {
      if (event.shiftKey && !event.altKey && !event.ctrlKey) {
        // smoothing on shift key
        if (selectedTool !== Enums.Tools.SMOOTH) {
          this._toolOnRelease = selectedTool;
          this._ctrlSculpt.setValue(Enums.Tools.SMOOTH);
        }
      }
      if (event.ctrlKey && !event.shiftKey && !event.altKey) {
        // masking on ctrl key
        if (selectedTool !== Enums.Tools.MASKING) {
          this._toolOnRelease = selectedTool;
          this._ctrlSculpt.setValue(Enums.Tools.MASKING);
        }
      }
    }
    if (event.altKey) {
      // invert sign on alt key
      if (this._invertSign || event.shiftKey) return true;
      this._invertSign = true;
      var curTool = GuiTools[selectedTool];
      if (curTool.toggleNegative)
        curTool.toggleNegative();
      return true;
    }
    return false;
  }

  ////////////////
  // KEY EVENTS
  //////////////// 
  onKeyDown(event) {
    if (event.handled === true)
      return;

    var main = this._main;
    var shk = getOptionsURL.getShortKey(event.which);
    event.stopPropagation();

    if (!main._focusGui || shk === Enums.KeyAction.RADIUS || shk === Enums.KeyAction.INTENSITY)
      event.preventDefault();

    event.handled = true;
    if (this._checkModifierKey(event))
      return;

    if (main._action !== Enums.Action.NOTHING)
      return;

    if (shk !== undefined && Tools[shk])
      return this._ctrlSculpt.setValue(shk);

    var cur = GuiTools[this.getSelectedTool()];

    switch (shk) {
    case Enums.KeyAction.DELETE:
      main.deleteCurrentSelection();
      break;
    case Enums.KeyAction.INTENSITY:
      this._modalBrushIntensity = main._focusGui = true;
      break;
    case Enums.KeyAction.RADIUS:
      if (!this._modalBrushRadius) this._startModalBrushRadius(this._lastPageX, this._lastPageY);
      this._modalBrushRadius = main._focusGui = true;
      break;
    case Enums.KeyAction.NEGATIVE:
      if (cur.toggleNegative) cur.toggleNegative();
      break;
    case Enums.KeyAction.PICKER:
      var ctrlPicker = cur._ctrlPicker;
      if (ctrlPicker && !ctrlPicker.getValue()) ctrlPicker.setValue(true);
      break;
    default:
      event.handled = false;
    }
  }

  onKeyUp(event) {
    var releaseTool = this._main._action === Enums.Action.NOTHING && this._toolOnRelease !== -1 && !event.ctrlKey && !event.shiftKey;
    if (!event.altKey || releaseTool)
      this.releaseInvertSign();

    if (releaseTool) {
      this._ctrlSculpt.setValue(this._toolOnRelease);
      this._toolOnRelease = -1;
    }

    var main = this._main;
    switch (getOptionsURL.getShortKey(event.which)) {
    case Enums.KeyAction.RADIUS:
      this._modalBrushRadius = main._focusGui = false;
      var selRadius = this._main.getSculptManager().getSelection();
      selRadius.setOffsetX(0.0);
      event.pageX = this._lastPageX;
      event.pageY = this._lastPageY;
      main.setMousePosition(event);
      main.getPicking().intersectionMouseMeshes();
      main.renderSelectOverRtt();
      break;
    case Enums.KeyAction.PICKER:
      var cur = GuiTools[this.getSelectedTool()];
      var ctrlPicker = cur._ctrlPicker;
      if (ctrlPicker && ctrlPicker.getValue()) ctrlPicker.setValue(false);
      break;
    case Enums.KeyAction.INTENSITY:
      this._modalBrushIntensity = main._focusGui = false;
      break;
    }
  }

  ////////////////
  // MOUSE EVENTS
  ////////////////
  onMouseUp(event) {
    if (this._toolOnRelease !== -1 && !event.ctrlKey && !event.shiftKey) {
      this.releaseInvertSign();
      this._ctrlSculpt.setValue(this._toolOnRelease);
      this._toolOnRelease = -1;
    }
  }

  onMouseMove(event) {
    var wid = GuiTools[this.getSelectedTool()];

    if (this._modalBrushRadius && wid._ctrlRadius) {
      var dx = event.pageX - this._refX;
      var dy = event.pageY - this._refY;
      wid._ctrlRadius.setValue(Math.sqrt(dx * dx + dy * dy));
      this._main.renderSelectOverRtt();
    }

    if (this._modalBrushIntensity && wid._ctrlIntensity) {
      wid._ctrlIntensity.setValue(wid._ctrlIntensity.getValue() + event.pageX - this._lastPageX);
    }

    this._lastPageX = event.pageX;
    this._lastPageY = event.pageY;
  }

  onMouseOver(event) {
    if (this._modalBrushRadius)
      this._startModalBrushRadius(event.pageX, event.pageY);
  }
}

export default GuiSculpting;
