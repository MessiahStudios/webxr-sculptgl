import Selection from 'drawables/Selection';
import Tools from 'editing/tools/Tools';
import Enums from 'misc/Enums';
import XRRemoteLog from 'xr/XRRemoteLog';

class SculptManager {

  constructor(main) {
    this._main = main;

    this._toolIndex = Enums.Tools.BRUSH; // sculpting mode
    this._tools = []; // the sculpting tools

    // symmetry stuffs
    this._symmetry = true; // if symmetric sculpting is enabled  

    // continuous stuffs
    this._continuous = false; // continuous sculpting
    this._sculptTimer = -1; // continuous interval timer

    this._selection = new Selection(main._gl); // the selection geometry (red hover circle)
    this._desktopStrokeLogAt = 0;

    this.init();
  }

  setToolIndex(id) {
    this._toolIndex = id | 0;
  }

  getToolIndex() {
    return this._toolIndex;
  }

  getCurrentTool() {
    return this._tools[this._toolIndex];
  }

  getSymmetry() {
    return this._symmetry;
  }

  getTool(index) {
    return this._tools[index];
  }

  getSelection() {
    return this._selection;
  }

  init() {
    var main = this._main;
    var tools = this._tools;
    for (var i = 0, nb = Tools.length; i < nb; ++i) {
      if (Tools[i]) tools[i] = new Tools[i](main);
    }
  }

  canBeContinuous() {
    switch (this._toolIndex) {
    case Enums.Tools.TWIST:
    case Enums.Tools.MOVE:
    case Enums.Tools.DRAG:
    case Enums.Tools.LOCALSCALE:
    case Enums.Tools.TRANSFORM:
      return false;
    default:
      return true;
    }
  }

  isUsingContinuous() {
    return this._continuous && this.canBeContinuous();
  }

  start(ctrl) {
    var tool = this.getCurrentTool();
    var canEdit = tool.start(ctrl);
    if (this._main.getPicking().getMesh() && this.isUsingContinuous())
      this._sculptTimer = window.setInterval(tool._cbContinuous, 16.6);
    this._logDesktopStrokeStart(canEdit, tool);
    return canEdit;
  }

  /** Throttled paint/surface stroke breadcrumbs for /__xr_logs while on desktop. */
  _logDesktopStrokeStart(canEdit, tool) {
    var main = this._main;
    if (main.isXRSessionActive && main.isXRSessionActive())
      return;
    var idx = this._toolIndex;
    var surface = idx === Enums.Tools.PAINT || idx === Enums.Tools.SOFTEN || idx === Enums.Tools.MASKING;
    if (!surface) return;

    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (this._desktopStrokeLogAt && (now - this._desktopStrokeLogAt) < 700)
      return;
    this._desktopStrokeLogAt = now;

    var mesh = main.getPicking().getMesh() || main.getMesh();
    var ui = (Tools[idx] && Tools[idx].uiName) || String(idx);
    if (!canEdit || !mesh) {
      XRRemoteLog.see('DESKTOP', 'Stroke missed — no mesh under cursor (' + ui + ')', {
        tool: ui,
        canEdit: !!canEdit
      });
      return;
    }

    var detail = {
      tool: ui,
      verts: mesh.getNbVertices ? mesh.getNbVertices() : 0,
      hasUV: !!(mesh.hasUV && mesh.hasUV()),
      hasPbrMaps: !!(mesh.hasPbrMaps && mesh.hasPbrMaps()),
      shader: mesh.getShaderType ? mesh.getShaderType() : undefined,
      radius: tool._radius,
      intensity: tool._intensity,
      hardness: tool._hardness
    };
    if (Object.prototype.hasOwnProperty.call(tool, '_writeAlbedo')) {
      detail.writeAlbedo = !!tool._writeAlbedo;
      detail.writeRoughness = !!tool._writeRoughness;
      detail.writeMetalness = !!tool._writeMetalness;
    }
    if (Object.prototype.hasOwnProperty.call(tool, '_pickColor') && tool._pickColor)
      detail.eyedropper = true;

    XRRemoteLog.see('DESKTOP', 'Stroke start → ' + ui, detail);
  }

  startXR() {
    var tool = this.getCurrentTool();
    if (!tool.startXR)
      return false;
    return tool.startXR();
  }

  updateXR() {
    var tool = this.getCurrentTool();
    if (tool.updateXR)
      tool.updateXR();
  }

  end() {
    this.getCurrentTool().end();
    if (this._sculptTimer !== -1) {
      clearInterval(this._sculptTimer);
      this._sculptTimer = -1;
    }
  }

  preUpdate() {
    this.getCurrentTool().preUpdate(this.canBeContinuous());
  }

  update() {
    if (this.isUsingContinuous())
      return;
    this.getCurrentTool().update();
  }

  postRender() {
    this.getCurrentTool().postRender(this._selection);
  }

  addSculptToScene(scene) {
    return this.getCurrentTool().addSculptToScene(scene);
  }
}

export default SculptManager;
