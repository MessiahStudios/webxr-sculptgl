import { vec3, mat4 } from 'gl-matrix';
import Gizmo from 'editing/Gizmo';
import SculptBase from 'editing/tools/SculptBase';
import XRRemoteLog from 'xr/XRRemoteLog';

var _TMP = [0.0, 0.0, 0.0];
var _TMP2 = [0.0, 0.0, 0.0];

class Transform extends SculptBase {

  constructor(main) {
    super(main);

    this._gizmo = new Gizmo(main);
    this._xrMode = null; // 'gizmo' | 'grab' | null
    this._xrGrabTip0 = null;
    this._xrGrabLogged = false;
    this._xrAwaitTriggerRelease = false;
  }

  isIdentity(m) {
    if (m[0] !== 1.0 || m[5] !== 1.0 || m[10] !== 1.0 || m[15] !== 1.0) return false;
    if (m[1] !== 0.0 || m[2] !== 0.0 || m[3] !== 0.0 || m[4] !== 0.0) return false;
    if (m[6] !== 0.0 || m[7] !== 0.0 || m[8] !== 0.0 || m[9] !== 0.0) return false;
    if (m[11] !== 0.0 || m[12] !== 0.0 || m[13] !== 0.0 || m[14] !== 0.0) return false;
    return true;
  }

  preUpdate() {
    var picking = this._main.getPicking();

    var mesh = picking.getMesh();
    this._gizmo.onMouseOver();
    picking._mesh = mesh;

    this._main.setCanvasCursor('default');
  }

  /** XR hover: highlight gizmo handles without requiring trigger. */
  preUpdateXR() {
    var main = this._main;
    if (!main._xrRayNear || !main._xrRayFar) return;
    if (!main.getSelectedMeshes().length && !main.getMesh()) return;
    if (this._xrMode) return;
    this._gizmo.pickXR(main._xrRayNear, main._xrRayFar);
  }

  start(ctrl) {
    var main = this._main;
    var mesh = this.getMesh();
    var picking = main.getPicking();

    if (mesh && this._gizmo.onMouseDown()) {
      picking._mesh = mesh;
      return true;
    }

    if (!picking.intersectionMouseMeshes(main.getMeshes(), main._mouseX, main._mouseY))
      return false;

    if (!main.setOrUnsetMesh(picking.getMesh(), ctrl))
      return false;

    this._lastMouseX = main._mouseX;
    this._lastMouseY = main._mouseY;
    return false;
  }

  /**
   * XR: ray-pick gizmo handle → axis edit; else ray-pick mesh → select (+ multi) and free-grab.
   * Left trigger (main._xrMultiSelect) toggles multi-select like desktop Ctrl — edge only (one click).
   * Right trigger alone always single-selects that mesh (easy escape from multi), then free-grabs it.
   * Group move: build selection with L+R, then drag the gizmo.
   */
  startXR() {
    var main = this._main;
    var near = main._xrRayNear;
    var far = main._xrRayFar;
    if (!near || !far) return false;

    // Wait for right-trigger release after a multi-select click (prevents 1↔2 flicker every frame).
    if (this._xrAwaitTriggerRelease)
      return false;

    // Already in a grab/gizmo stroke — keep it (Scene should call updateXR, not restart).
    if (this._xrMode === 'gizmo' || this._xrMode === 'grab')
      return true;

    this._xrMode = null;
    this._xrGrabLogged = false;

    // Prefer gizmo handles when a selection exists (group transform path)
    if (main.getSelectedMeshes().length || main.getMesh()) {
      if (this._gizmo.pickXR(near, far) && this._gizmo.startXREdit()) {
        this._xrMode = 'gizmo';
        XRRemoteLog.see('MR', 'Transform gizmo grab', {
          multi: main.getSelectedMeshes().length
        });
        return true;
      }
    }

    var picking = main.getPicking();
    if (!picking.intersectionSceneRayMeshes(near, far))
      return false;

    var mesh = picking.getMesh();
    var multi = !!main._xrMultiSelect;

    if (multi) {
      main.setOrUnsetMesh(mesh, true);
      this._xrAwaitTriggerRelease = true;
      XRRemoteLog.see('MR', 'Transform multi-select', {
        count: main.getSelectedMeshes().length
      });
      return false;
    }

    // Right alone = single selection (clears multi), then free-grab that mesh
    if (!main.setOrUnsetMesh(mesh, false))
      return false;

    this._gizmo._saveEditMatrices();
    this._xrGrabTip0 = near.slice();
    this._xrMode = 'grab';
    XRRemoteLog.see('MR', 'Transform free-grab', {
      multi: main.getSelectedMeshes().length
    });
    return true;
  }

  /** Called by Scene when right trigger releases (even if startXR returned false). */
  onXRTriggerRelease() {
    this._xrAwaitTriggerRelease = false;
  }

  end() {
    this._gizmo.onMouseUp();
    this._gizmo.endXREdit();
    // Freeze grab tip before bake so release doesn't drag one more frame
    this._xrMode = null;
    this._xrGrabTip0 = null;
    this._xrAwaitTriggerRelease = false;

    var meshes = this._main.getSelectedMeshes().slice();
    var anyEdit = false;
    var c;
    for (c = 0; c < meshes.length; ++c) {
      if (meshes[c] && !this.isIdentity(meshes[c].getEditMatrix())) {
        anyEdit = true;
        break;
      }
    }
    if (!anyEdit) {
      this._forceToolMesh = null;
      return;
    }

    for (var i = 0; i < meshes.length; ++i) {
      if (!meshes[i] || typeof meshes[i].getVertices !== 'function')
        continue;
      if (this.isIdentity(meshes[i].getEditMatrix()))
        continue;

      this._forceToolMesh = meshes[i];

      this.pushState();
      if (i > 0) this._main.getStateManager().getCurrentState().squash = true;

      var iVerts = this.getUnmaskedVertices();
      this._main.getStateManager().pushVertices(iVerts);
      this.applyEditMatrix(iVerts);

      if (iVerts.length === 0) continue;
      this.updateMeshBuffers();
    }
    this._forceToolMesh = null;
    // Snap visuals to baked verts (clears any leftover edit preview)
    this._main.render();
    // Re-aim orbit at the moved selection COM without jumping the room view.
    if (this._main.syncXROrbitPivotToSelection) {
      this._main.syncXROrbitPivotToSelection(true);
      if (this._main._rebuildXRStageMatrix)
        this._main._rebuildXRStageMatrix();
    }
  }

  applyEditMatrix(iVerts) {
    var mesh = this.getMesh();
    if (!mesh || !iVerts) return;
    var em = mesh.getEditMatrix();
    var mAr = mesh.getMaterials();
    var vAr = mesh.getVertices();
    if (!vAr) return;
    var vTemp = [0.0, 0.0, 0.0];
    for (var i = 0, nb = iVerts.length; i < nb; ++i) {
      var j = iVerts[i] * 3;
      var mask = mAr ? mAr[j + 2] : 1.0;
      var x = vTemp[0] = vAr[j];
      var y = vTemp[1] = vAr[j + 1];
      var z = vTemp[2] = vAr[j + 2];
      vec3.transformMat4(vTemp, vTemp, em);
      var iMask = 1.0 - mask;
      vAr[j] = x * iMask + vTemp[0] * mask;
      vAr[j + 1] = y * iMask + vTemp[1] * mask;
      vAr[j + 2] = z * iMask + vTemp[2] * mask;
    }
    vec3.transformMat4(mesh.getCenter(), mesh.getCenter(), em);
    mat4.identity(em);
    if (iVerts.length === mesh.getNbVertices()) mesh.updateGeometry();
    else mesh.updateGeometry(mesh.getFacesFromVertices(iVerts), iVerts);
  }

  update() {}

  updateXR() {
    var main = this._main;
    var near = main._xrRayNear;
    var far = main._xrRayFar;
    if (!near || !far) return;

    if (this._xrMode === 'gizmo') {
      this._gizmo.updateXREdit(near, far);
      return;
    }

    if (this._xrMode === 'grab' && this._xrGrabTip0) {
      // Scene-space tip delta → translation on all selected edit matrices
      _TMP[0] = near[0] - this._xrGrabTip0[0];
      _TMP[1] = near[1] - this._xrGrabTip0[1];
      _TMP[2] = near[2] - this._xrGrabTip0[2];

      var meshes = main.getSelectedMeshes();
      var i;
      for (i = 0; i < meshes.length; ++i) {
        var edim = meshes[i].getEditMatrix();
        var inv = this._gizmo._editScaleRotInv[i];
        if (inv) {
          _TMP2[0] = inv[0] * _TMP[0] + inv[4] * _TMP[1] + inv[8] * _TMP[2];
          _TMP2[1] = inv[1] * _TMP[0] + inv[5] * _TMP[1] + inv[9] * _TMP[2];
          _TMP2[2] = inv[2] * _TMP[0] + inv[6] * _TMP[1] + inv[10] * _TMP[2];
        } else {
          vec3.copy(_TMP2, _TMP);
        }
        mat4.identity(edim);
        mat4.translate(edim, edim, _TMP2);
      }
      main.render();
    }
  }

  postRender() {
    if (this.getMesh() || (this._main.getSelectedMeshes() && this._main.getSelectedMeshes().length))
      this._gizmo.render();
  }

  addSculptToScene(scene) {
    if (this.getMesh())
      this._gizmo.addGizmoToScene(scene);
  }
}

export default Transform;
