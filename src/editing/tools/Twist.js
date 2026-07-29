import { vec2, vec3, quat, mat4 } from 'gl-matrix';
import Geometry from 'math3d/Geometry';
import SculptBase from 'editing/tools/SculptBase';
import XRRemoteLog from 'xr/XRRemoteLog';

var _TMP_INV = mat4.create();
var _TMP_V = [0.0, 0.0, 0.0];
var _TMP_N = [0.0, 0.0, 0.0];
var _TMP_T = [0.0, 0.0, 0.0];
var _TMP_B = [0.0, 0.0, 0.0];

class Twist extends SculptBase {

  constructor(main) {
    super(main);

    this._radius = 75;
    this._culling = false;
    this._twistData = {
      normal: [0.0, 0.0, 0.0],
      center: [0.0, 0.0]
    };
    this._twistDataSym = {
      normal: [0.0, 0.0, 0.0],
      center: [0.0, 0.0]
    };
    this._idAlpha = 0;
    this._xrTwistCenter = [0.0, 0.0, 0.0];
    this._xrTwistPrevAngle = 0;
    this._xrTwistActive = false;
    this._xrTwistRadius2 = 0;
    this._xrTwistAxis = [0.0, 0.0, 1.0];
    this._xrLogged = false;
  }

  startSculpt() {
    var main = this._main;
    var mouseX = main._mouseX;
    var mouseY = main._mouseY;
    var picking = main.getPicking();
    this.initTwistData(picking, mouseX, mouseY, this._twistData);
    if (main.getSculptManager().getSymmetry()) {
      var pickingSym = main.getPickingSymmetry();
      pickingSym.intersectionMouseMesh();
      pickingSym.setLocalRadius2(picking.getLocalRadius2());
      if (pickingSym.getMesh())
        this.initTwistData(pickingSym, mouseX, mouseY, this._twistDataSym);
    }
  }

  initTwistData(picking, mouseX, mouseY, twistData) {
    picking.pickVerticesInSphere(picking.getLocalRadius2());
    vec3.negate(twistData.normal, picking.getEyeDirection());
    vec2.set(twistData.center, mouseX, mouseY);
  }

  sculptStroke() {
    var main = this._main;
    var mx = main._mouseX;
    var my = main._mouseY;
    var lx = main._lastMouseX;
    var ly = main._lastMouseY;
    var picking = main.getPicking();
    var rLocal2 = picking.getLocalRadius2();
    picking.pickVerticesInSphere(rLocal2);
    this.stroke(picking, mx, my, lx, ly, this._twistData);

    if (main.getSculptManager().getSymmetry()) {
      var pickingSym = main.getPickingSymmetry();
      if (pickingSym.getMesh()) {
        pickingSym.pickVerticesInSphere(rLocal2);
        this.stroke(pickingSym, lx, ly, mx, my, this._twistDataSym);
      }
    }
    this.updateRender();
    main.setCanvasCursor('default');
  }

  stroke(picking, mx, my, lx, ly, twistData) {
    var iVertsInRadius = picking.getPickedVertices();
    this._main.getStateManager().pushVertices(iVertsInRadius);
    iVertsInRadius = this.dynamicTopology(picking);

    if (this._culling)
      iVertsInRadius = this.getFrontVertices(iVertsInRadius, picking.getEyeDirection());

    picking.updateAlpha(false);
    picking.setIdAlpha(this._idAlpha);
    this.twist(iVertsInRadius, picking.getIntersectionPoint(), picking.getLocalRadius2(), mx, my, lx, ly, twistData, picking);

    var mesh = this.getMesh();
    mesh.updateGeometry(mesh.getFacesFromVertices(iVertsInRadius), iVertsInRadius);
  }

  twist(iVerts, center, radiusSquared, mouseX, mouseY, lastMouseX, lastMouseY, twistData, picking) {
    var mouseCenter = twistData.center;
    var vecMouse = [mouseX - mouseCenter[0], mouseY - mouseCenter[1]];
    if (vec2.len(vecMouse) < 30)
      return;
    vec2.normalize(vecMouse, vecMouse);
    var vecOldMouse = [lastMouseX - mouseCenter[0], lastMouseY - mouseCenter[1]];
    vec2.normalize(vecOldMouse, vecOldMouse);
    var angle = Geometry.signedAngle2d(vecMouse, vecOldMouse);
    this._twistByAngle(iVerts, center, radiusSquared, angle, twistData.normal, picking);
  }

  _twistByAngle(iVerts, center, radiusSquared, angle, nPlane, picking) {
    if (!iVerts || !iVerts.length || Math.abs(angle) < 1e-6)
      return;
    var mesh = this.getMesh();
    var rot = [0.0, 0.0, 0.0, 0.0];
    var vAr = mesh.getVertices();
    var mAr = mesh.getMaterials();
    var invRadius = 1.0 / Math.sqrt(radiusSquared);
    var cx = center[0];
    var cy = center[1];
    var cz = center[2];
    var coord = [0.0, 0.0, 0.0];
    for (var i = 0, l = iVerts.length; i < l; ++i) {
      var ind = iVerts[i] * 3;
      var vx = vAr[ind];
      var vy = vAr[ind + 1];
      var vz = vAr[ind + 2];
      var dx = vx - cx;
      var dy = vy - cy;
      var dz = vz - cz;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) * invRadius;
      var fallOff = dist * dist;
      fallOff = 3.0 * fallOff * fallOff - 4.0 * fallOff * dist + 1.0;
      fallOff *= angle * mAr[ind + 2] * picking.getAlpha(vx, vy, vz);
      quat.setAxisAngle(rot, nPlane, fallOff);
      vec3.set(coord, vx, vy, vz);
      vec3.sub(coord, coord, center);
      vec3.transformQuat(coord, coord, rot);
      vec3.add(coord, coord, center);
      vAr[ind] = coord[0];
      vAr[ind + 1] = coord[1];
      vAr[ind + 2] = coord[2];
    }
  }

  _dirToLocal(mesh, dirScene, out) {
    mat4.invert(_TMP_INV, mesh.getMatrix());
    out[0] = _TMP_INV[0] * dirScene[0] + _TMP_INV[4] * dirScene[1] + _TMP_INV[8] * dirScene[2];
    out[1] = _TMP_INV[1] * dirScene[0] + _TMP_INV[5] * dirScene[1] + _TMP_INV[9] * dirScene[2];
    out[2] = _TMP_INV[2] * dirScene[0] + _TMP_INV[6] * dirScene[1] + _TMP_INV[10] * dirScene[2];
    vec3.normalize(out, out);
  }

  /** Angle of controller right-vector around the aim axis (reliable wrist roll). */
  _readTwistAngle(mesh) {
    var main = this._main;
    if (!main._xrRayNear || !main._xrRayFar)
      return 0;

    var nScene = [
      main._xrRayFar[0] - main._xrRayNear[0],
      main._xrRayFar[1] - main._xrRayNear[1],
      main._xrRayFar[2] - main._xrRayNear[2]
    ];
    this._dirToLocal(mesh, nScene, _TMP_N);
    vec3.copy(this._xrTwistAxis, _TMP_N);

    var ref = main._xrRayRight || main._xrRayUp;
    if (!ref) return 0;
    this._dirToLocal(mesh, ref, _TMP_V);

    var tmp = Math.abs(_TMP_N[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    vec3.cross(_TMP_T, tmp, _TMP_N);
    vec3.normalize(_TMP_T, _TMP_T);
    vec3.cross(_TMP_B, _TMP_N, _TMP_T);

    var dn = vec3.dot(_TMP_V, _TMP_N);
    var vx = _TMP_V[0] - _TMP_N[0] * dn;
    var vy = _TMP_V[1] - _TMP_N[1] * dn;
    var vz = _TMP_V[2] - _TMP_N[2] * dn;
    return Math.atan2(vx * _TMP_B[0] + vy * _TMP_B[1] + vz * _TMP_B[2],
      vx * _TMP_T[0] + vy * _TMP_T[1] + vz * _TMP_T[2]);
  }

  /**
   * XR twist: wrist roll around aim, plus right-stick X while held (orbit disabled).
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
    vec3.copy(this._xrTwistCenter, picking.getIntersectionPoint());
    this._xrTwistRadius2 = picking.getLocalRadius2();
    this._xrTwistPrevAngle = this._readTwistAngle(mesh);
    this._xrTwistActive = true;
    vec3.copy(this._twistData.normal, this._xrTwistAxis);
    vec2.set(this._twistData.center, 0, 0);

    if (main.getSculptManager().getSymmetry() && main._xrRayNear && main._xrRayFar) {
      var pickingSym = main.getPickingSymmetry();
      pickingSym.intersectionSceneRayMesh(mesh, main._xrRayNear, main._xrRayFar);
      pickingSym.setLocalRadius2(this._xrTwistRadius2);
      if (pickingSym.getMesh()) {
        pickingSym.pickVerticesInSphere(this._xrTwistRadius2);
        vec3.copy(this._twistDataSym.normal, this._twistData.normal);
        vec2.set(this._twistDataSym.center, 0, 0);
      }
    }
    if (!this._xrLogged) {
      this._xrLogged = true;
      XRRemoteLog.see('MR', 'Twist armed — roll wrist OR flick right stick X while holding trigger');
    }
    return true;
  }

  updateXR() {
    var main = this._main;
    var picking = main.getPicking();
    var mesh = this.getMesh();
    if (!mesh || !this._xrTwistActive)
      return;

    var cur = this._readTwistAngle(mesh);
    var angle = cur - this._xrTwistPrevAngle;
    if (angle > Math.PI) angle -= Math.PI * 2;
    if (angle < -Math.PI) angle += Math.PI * 2;
    this._xrTwistPrevAngle = cur;

    // Stick assist (right stick X while holding) — more reliable than tiny wrist rolls.
    var stickX = main._xrRightStickX || 0;
    if (Math.abs(stickX) > 0.2)
      angle += stickX * 0.12;

    // Amplify wrist roll so small rotations register
    angle *= 1.8;

    if (angle > 0.45) angle = 0.45;
    if (angle < -0.45) angle = -0.45;
    if (Math.abs(angle) < 0.0015)
      return;

    picking._mesh = mesh;
    picking.setIntersectionPoint(this._xrTwistCenter);
    picking.setLocalRadius2(this._xrTwistRadius2);
    picking.pickVerticesInSphere(this._xrTwistRadius2);
    picking.updateAlpha(false);
    picking.setIdAlpha(this._idAlpha);

    var iVerts = picking.getPickedVertices();
    this._main.getStateManager().pushVertices(iVerts);
    iVerts = this.dynamicTopology(picking);
    if (this._culling)
      iVerts = this.getFrontVertices(iVerts, picking.getEyeDirection());
    this._twistByAngle(iVerts, this._xrTwistCenter, this._xrTwistRadius2, angle, this._xrTwistAxis, picking);
    mesh.updateGeometry(mesh.getFacesFromVertices(iVerts), iVerts);

    if (main.getSculptManager().getSymmetry()) {
      var pickingSym = main.getPickingSymmetry();
      if (pickingSym.getMesh()) {
        pickingSym.setLocalRadius2(this._xrTwistRadius2);
        pickingSym.pickVerticesInSphere(this._xrTwistRadius2);
        var iSym = pickingSym.getPickedVertices();
        this._main.getStateManager().pushVertices(iSym);
        iSym = this.dynamicTopology(pickingSym);
        this._twistByAngle(iSym, pickingSym.getIntersectionPoint(), this._xrTwistRadius2, -angle, this._xrTwistAxis, pickingSym);
        mesh.updateGeometry(mesh.getFacesFromVertices(iSym), iSym);
      }
    }
    this.updateMeshBuffers();
  }

  end() {
    this._xrTwistActive = false;
    SculptBase.prototype.end.call(this);
  }
}

export default Twist;
