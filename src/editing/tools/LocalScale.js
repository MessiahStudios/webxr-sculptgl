import { vec3, mat4 } from 'gl-matrix';
import SculptBase from 'editing/tools/SculptBase';
import XRRemoteLog from 'xr/XRRemoteLog';

var _TMP_INV = mat4.create();
var _TMP_TIP = [0.0, 0.0, 0.0];

class LocalScale extends SculptBase {

  constructor(main) {
    super(main);

    this._radius = 50;
    this._culling = false;
    this._idAlpha = 0;
    this._xrScalePrevDist = 0;
    this._xrScaleCenter = null;
    this._xrScaleRadius2 = 0;
    this._xrScaleActive = false;
    this._xrLogged = false;
  }

  startSculpt() {
    var main = this._main;
    if (main.getSculptManager().getSymmetry()) {
      var pickingSym = main.getPickingSymmetry();
      pickingSym.intersectionMouseMesh();
      pickingSym.setLocalRadius2(main.getPicking().getLocalRadius2());
    }
  }

  sculptStroke() {
    var main = this._main;
    var delta = main._mouseX - main._lastMouseX;
    var picking = main.getPicking();
    var rLocal2 = picking.getLocalRadius2();
    picking.pickVerticesInSphere(rLocal2);
    this.stroke(picking, delta);

    if (main.getSculptManager().getSymmetry()) {
      var pickingSym = main.getPickingSymmetry();
      if (pickingSym.getMesh()) {
        pickingSym.pickVerticesInSphere(rLocal2);
        this.stroke(pickingSym, delta);
      }
    }
    this.updateRender();
  }

  stroke(picking, delta) {
    var iVertsInRadius = picking.getPickedVertices();
    this._main.getStateManager().pushVertices(iVertsInRadius);
    iVertsInRadius = this.dynamicTopology(picking);

    if (this._culling)
      iVertsInRadius = this.getFrontVertices(iVertsInRadius, picking.getEyeDirection());

    picking.updateAlpha(false);
    picking.setIdAlpha(this._idAlpha, this._alphaAngle);
    this.scale(iVertsInRadius, picking.getIntersectionPoint(), picking.getLocalRadius2(), delta, picking);

    var mesh = this.getMesh();
    mesh.updateGeometry(mesh.getFacesFromVertices(iVertsInRadius), iVertsInRadius);
  }

  scale(iVerts, center, radiusSquared, intensity, picking) {
    var mesh = this.getMesh();
    var vAr = mesh.getVertices();
    var mAr = mesh.getMaterials();
    var deltaScale = intensity * 0.01;
    var radius = Math.sqrt(radiusSquared);
    var cx = center[0];
    var cy = center[1];
    var cz = center[2];
    for (var i = 0, l = iVerts.length; i < l; ++i) {
      var ind = iVerts[i] * 3;
      var vx = vAr[ind];
      var vy = vAr[ind + 1];
      var vz = vAr[ind + 2];
      var dx = vx - cx;
      var dy = vy - cy;
      var dz = vz - cz;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) / radius;
      var fallOff = dist * dist;
      fallOff = 3.0 * fallOff * fallOff - 4.0 * fallOff * dist + 1.0;
      fallOff *= deltaScale * mAr[ind + 2] * picking.getAlpha(vx, vy, vz);
      vAr[ind] = vx + dx * fallOff;
      vAr[ind + 1] = vy + dy * fallOff;
      vAr[ind + 2] = vz + dz * fallOff;
    }
  }

  _tipDist(mesh) {
    var main = this._main;
    if (!main._xrRayNear || !this._xrScaleCenter)
      return null;
    mat4.invert(_TMP_INV, mesh.getMatrix());
    vec3.transformMat4(_TMP_TIP, main._xrRayNear, _TMP_INV);
    return vec3.dist(_TMP_TIP, this._xrScaleCenter);
  }

  /**
   * XR local-scale: push/pull tip toward/away from grab, or right-stick Y while held.
   */
  startXR() {
    var main = this._main;
    var picking = main.getPicking();
    var mesh = picking.getMesh();
    if (!mesh)
      return false;

    mesh = main.setOrUnsetMesh(mesh, false);
    if (!mesh)
      return false;

    picking.initAlpha();
    this.pushState();
    picking.applyXRBrushRadius();
    picking.pickVerticesInSphere(picking.getLocalRadius2());
    this._xrScaleCenter = vec3.clone(picking.getIntersectionPoint());
    this._xrScaleRadius2 = picking.getLocalRadius2();

    var dist = this._tipDist(mesh);
    if (dist === null)
      dist = 0;
    this._xrScalePrevDist = dist;
    this._xrScaleActive = true;

    if (main.getSculptManager().getSymmetry() && main._xrRayNear && main._xrRayFar) {
      var pickingSym = main.getPickingSymmetry();
      pickingSym.intersectionSceneRayMesh(mesh, main._xrRayNear, main._xrRayFar);
      pickingSym.setLocalRadius2(this._xrScaleRadius2);
      if (pickingSym.getMesh())
        pickingSym.pickVerticesInSphere(this._xrScaleRadius2);
    }
    if (!this._xrLogged) {
      this._xrLogged = true;
      XRRemoteLog.see('MR', 'LocalScale armed — push/pull along aim OR flick right stick Y while holding');
    }
    return true;
  }

  updateXR() {
    var main = this._main;
    var picking = main.getPicking();
    var mesh = this.getMesh();
    if (!mesh || !this._xrScaleActive || !this._xrScaleCenter)
      return;

    var dist = this._tipDist(mesh);
    if (dist === null)
      return;

    // Away from clay = grow (positive desktop mouse-X).
    var dDist = dist - this._xrScalePrevDist;
    this._xrScalePrevDist = dist;

    var radius = Math.sqrt(this._xrScaleRadius2);
    var delta = dDist * (520.0 / Math.max(radius, 0.05));

    // Stick assist (right stick Y): up = grow, down = shrink.
    var stickY = main._xrRightStickY || 0;
    if (Math.abs(stickY) > 0.2)
      delta += stickY * -18.0;

    if (delta > 55) delta = 55;
    if (delta < -55) delta = -55;
    if (Math.abs(delta) < 0.05)
      return;

    picking._mesh = mesh;
    picking.setIntersectionPoint(this._xrScaleCenter);
    picking.setLocalRadius2(this._xrScaleRadius2);
    picking.pickVerticesInSphere(this._xrScaleRadius2);
    this.stroke(picking, delta);

    if (main.getSculptManager().getSymmetry()) {
      var pickingSym = main.getPickingSymmetry();
      if (pickingSym.getMesh()) {
        pickingSym.setLocalRadius2(this._xrScaleRadius2);
        pickingSym.pickVerticesInSphere(this._xrScaleRadius2);
        this.stroke(pickingSym, delta);
      }
    }
    this.updateMeshBuffers();
  }

  end() {
    this._xrScaleActive = false;
    this._xrScaleCenter = null;
    this._xrScaleRadius2 = 0;
    SculptBase.prototype.end.call(this);
  }
}

export default LocalScale;
