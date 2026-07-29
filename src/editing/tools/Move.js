import { vec3, mat4 } from 'gl-matrix';
import Geometry from 'math3d/Geometry';
import SculptBase from 'editing/tools/SculptBase';

var _TMP_NEAR = [0.0, 0.0, 0.0];
var _TMP_FAR = [0.0, 0.0, 0.0];
var _TMP_INV = mat4.create();
var _TMP_DIR = [0.0, 0.0, 0.0];

class Move extends SculptBase {

  constructor(main) {
    super(main);

    this._radius = 150;
    this._intensity = 1.0;
    this._topoCheck = true;
    this._negative = false; // along normal
    this._moveData = {
      center: [0.0, 0.0, 0.0],
      dir: [0.0, 0.0],
      vProxy: null
    };
    this._moveDataSym = {
      center: [0.0, 0.0, 0.0],
      dir: [0.0, 0.0],
      vProxy: null
    };
    this._idAlpha = 0;
    this._xrMoveActive = false;
    this._xrMoveIVerts = null;
    this._xrMoveIVertsSym = null;
    this._xrMoveRadius2 = 0;
    this._xrMoveLast = null;
    this._xrMoveLastSym = null;
    this._xrMoveAccum = null;
    this._xrMoveAccumSym = null;
  }

  startSculpt() {
    var main = this._main;
    var picking = main.getPicking();
    this.initMoveData(picking, this._moveData);

    if (main.getSculptManager().getSymmetry()) {
      var pickingSym = main.getPickingSymmetry();
      pickingSym.intersectionMouseMesh();
      pickingSym.setLocalRadius2(picking.getLocalRadius2());

      if (pickingSym.getMesh())
        this.initMoveData(pickingSym, this._moveDataSym);
    }
  }

  initMoveData(picking, moveData) {
    if (this._topoCheck)
      picking.pickVerticesInSphereTopological(picking.getLocalRadius2());
    else
      picking.pickVerticesInSphere(picking.getLocalRadius2());
    vec3.copy(moveData.center, picking.getIntersectionPoint());
    var iVerts = picking.getPickedVertices();
    // undo-redo
    this._main.getStateManager().pushVertices(iVerts);

    var vAr = picking.getMesh().getVertices();
    var nbVerts = iVerts.length;
    var vProxy = moveData.vProxy = new Float32Array(nbVerts * 3);
    for (var i = 0; i < nbVerts; ++i) {
      var ind = iVerts[i] * 3;
      var j = i * 3;
      vProxy[j] = vAr[ind];
      vProxy[j + 1] = vAr[ind + 1];
      vProxy[j + 2] = vAr[ind + 2];
    }
  }

  copyVerticesProxy(picking, moveData) {
    var iVerts = picking.getPickedVertices();
    var vAr = this.getMesh().getVertices();
    var vProxy = moveData.vProxy;
    for (var i = 0, nbVerts = iVerts.length; i < nbVerts; ++i) {
      var ind = iVerts[i] * 3;
      var j = i * 3;
      vAr[ind] = vProxy[j];
      vAr[ind + 1] = vProxy[j + 1];
      vAr[ind + 2] = vProxy[j + 2];
    }
  }

  /** Like copyVerticesProxy but uses a stashed index list (XR-safe). */
  _copyProxyIndices(iVerts, moveData) {
    if (!iVerts || !moveData.vProxy) return;
    var vAr = this.getMesh().getVertices();
    var vProxy = moveData.vProxy;
    for (var i = 0, nbVerts = iVerts.length; i < nbVerts; ++i) {
      var ind = iVerts[i] * 3;
      var j = i * 3;
      vAr[ind] = vProxy[j];
      vAr[ind + 1] = vProxy[j + 1];
      vAr[ind + 2] = vProxy[j + 2];
    }
  }

  sculptStroke() {
    var main = this._main;
    var picking = main.getPicking();
    var pickingSym = main.getPickingSymmetry();
    var useSym = main.getSculptManager().getSymmetry() && pickingSym.getMesh();

    picking.updateAlpha(this._lockPosition);
    picking.setIdAlpha(this._idAlpha);
    if (useSym) {
      pickingSym.updateAlpha(false);
      pickingSym.setIdAlpha(this._idAlpha);
    }

    this.copyVerticesProxy(picking, this._moveData);
    if (useSym)
      this.copyVerticesProxy(pickingSym, this._moveDataSym);

    var mouseX = main._mouseX;
    var mouseY = main._mouseY;
    this.updateMoveDir(picking, mouseX, mouseY);
    this.move(picking.getPickedVertices(), picking.getIntersectionPoint(), picking.getLocalRadius2(), this._moveData, picking);

    if (useSym) {
      this.updateMoveDir(pickingSym, mouseX, mouseY, true);
      this.move(pickingSym.getPickedVertices(), pickingSym.getIntersectionPoint(), pickingSym.getLocalRadius2(), this._moveDataSym, pickingSym);
    }

    var mesh = this.getMesh();
    mesh.updateGeometry(mesh.getFacesFromVertices(picking.getPickedVertices()), picking.getPickedVertices());
    if (useSym)
      mesh.updateGeometry(mesh.getFacesFromVertices(pickingSym.getPickedVertices()), pickingSym.getPickedVertices());
    this.updateRender();
    main.setCanvasCursor('default');
  }

  move(iVerts, center, radiusSquared, moveData, picking) {
    var mesh = this.getMesh();
    var vAr = mesh.getVertices();
    var mAr = mesh.getMaterials();
    var radius = Math.sqrt(radiusSquared);
    var vProxy = moveData.vProxy;
    var cx = center[0];
    var cy = center[1];
    var cz = center[2];
    var dir = moveData.dir;
    var dirx = dir[0];
    var diry = dir[1];
    var dirz = dir[2];
    for (var i = 0, l = iVerts.length; i < l; ++i) {
      var ind = iVerts[i] * 3;
      var j = i * 3;
      var vx = vProxy[j];
      var vy = vProxy[j + 1];
      var vz = vProxy[j + 2];
      var dx = vx - cx;
      var dy = vy - cy;
      var dz = vz - cz;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) / radius;
      var fallOff = dist * dist;
      fallOff = 3.0 * fallOff * fallOff - 4.0 * fallOff * dist + 1.0;
      fallOff *= mAr[ind + 2] * picking.getAlpha(vx, vy, vz);
      vAr[ind] += dirx * fallOff;
      vAr[ind + 1] += diry * fallOff;
      vAr[ind + 2] += dirz * fallOff;
    }
  }

  updateMoveDir(picking, mouseX, mouseY, useSymmetry) {
    var mesh = this.getMesh();
    var vNear = picking.unproject(mouseX, mouseY, 0.0);
    var vFar = picking.unproject(mouseX, mouseY, 0.1);
    var matInverse = mat4.create();
    mat4.invert(matInverse, mesh.getMatrix());
    vec3.transformMat4(vNear, vNear, matInverse);
    vec3.transformMat4(vFar, vFar, matInverse);

    var moveData = useSymmetry ? this._moveDataSym : this._moveData;
    if (useSymmetry) {
      var ptPlane = mesh.getSymmetryOrigin();
      var nPlane = mesh.getSymmetryNormal();
      Geometry.mirrorPoint(vNear, ptPlane, nPlane);
      Geometry.mirrorPoint(vFar, ptPlane, nPlane);
    }

    if (this._negative) {
      var len = vec3.dist(Geometry.vertexOnLine(moveData.center, vNear, vFar), moveData.center);
      vec3.normalize(moveData.dir, picking.computePickedNormal());
      vec3.scale(moveData.dir, moveData.dir, mouseX < this._lastMouseX ? -len : len);
    } else {
      vec3.sub(moveData.dir, Geometry.vertexOnLine(moveData.center, vNear, vFar), moveData.center);
    }
    vec3.scale(moveData.dir, moveData.dir, this._intensity);

    var eyeDir = picking.getEyeDirection();
    vec3.sub(eyeDir, vFar, vNear);
    vec3.normalize(eyeDir, eyeDir);
  }

  /**
   * XR only — desktop path above is unchanged.
   * Limited Drag: slide the grab along the controller ray (frame deltas),
   * keep the original vertex set + falloff, clamp so aim/hand drift can't explode.
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
    this.initMoveData(picking, this._moveData);
    this._xrMoveIVerts = new Uint32Array(picking.getPickedVertices());
    this._xrMoveRadius2 = picking.getLocalRadius2();
    this._xrMoveLast = vec3.clone(this._moveData.center);
    this._xrMoveAccum = [0.0, 0.0, 0.0];
    this._xrMoveLastSym = null;
    this._xrMoveAccumSym = null;
    this._xrMoveActive = true;

    this._xrMoveIVertsSym = null;
    if (main.getSculptManager().getSymmetry() && main._xrRayNear && main._xrRayFar) {
      var pickingSym = main.getPickingSymmetry();
      pickingSym.intersectionSceneRayMesh(mesh, main._xrRayNear, main._xrRayFar);
      pickingSym.setLocalRadius2(this._xrMoveRadius2);
      if (pickingSym.getMesh()) {
        this.initMoveData(pickingSym, this._moveDataSym);
        this._xrMoveIVertsSym = new Uint32Array(pickingSym.getPickedVertices());
        this._xrMoveLastSym = vec3.clone(this._moveDataSym.center);
        this._xrMoveAccumSym = [0.0, 0.0, 0.0];
      }
    }
    return true;
  }

  /** Clamp vector length in-place; returns clamped length. */
  _clampVec(v, maxLen) {
    var len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (len > maxLen && len > 1e-12) {
      var s = maxLen / len;
      v[0] *= s;
      v[1] *= s;
      v[2] *= s;
      return maxLen;
    }
    return len;
  }

  updateXR() {
    var main = this._main;
    var picking = main.getPicking();
    var mesh = this.getMesh();
    if (!mesh || !this._xrMoveActive || !this._moveData.vProxy || !this._xrMoveLast || !main._xrRayNear || !main._xrRayFar)
      return;

    mat4.invert(_TMP_INV, mesh.getMatrix());
    vec3.transformMat4(_TMP_NEAR, main._xrRayNear, _TMP_INV);
    vec3.transformMat4(_TMP_FAR, main._xrRayFar, _TMP_INV);

    // Slide grab along current ray (same idea as Drag XR), then accumulate.
    var newPos = Geometry.vertexOnLine(this._xrMoveLast, _TMP_NEAR, _TMP_FAR);
    vec3.sub(_TMP_DIR, newPos, this._xrMoveLast);
    vec3.copy(this._xrMoveLast, newPos);

    var radius = Math.sqrt(this._xrMoveRadius2);
    // Per-frame cap stops one wild aim flick from shredding topology.
    this._clampVec(_TMP_DIR, radius * 0.35);
    vec3.add(this._xrMoveAccum, this._xrMoveAccum, _TMP_DIR);
    // Total pull stays within ~1 brush radius — "limited drag", not free translate.
    this._clampVec(this._xrMoveAccum, radius * 1.15);

    var pickingSym = main.getPickingSymmetry();
    var useSym = !!(main.getSculptManager().getSymmetry() && this._moveDataSym.vProxy && this._xrMoveIVertsSym);

    picking._mesh = mesh;
    picking.updateAlpha(this._lockPosition);
    picking.setIdAlpha(this._idAlpha);

    this._copyProxyIndices(this._xrMoveIVerts, this._moveData);

    if (this._negative) {
      var n = picking.computePickedNormal();
      var along = vec3.dot(this._xrMoveAccum, n);
      vec3.scale(this._moveData.dir, n, along * this._intensity);
    } else {
      vec3.scale(this._moveData.dir, this._xrMoveAccum, this._intensity);
    }

    this.move(this._xrMoveIVerts, this._moveData.center, this._xrMoveRadius2, this._moveData, picking);

    if (useSym && this._xrMoveLastSym && this._xrMoveAccumSym) {
      // Slide the mirrored grab on a mirrored ray (desktop Move parity).
      var nearSym = [_TMP_NEAR[0], _TMP_NEAR[1], _TMP_NEAR[2]];
      var farSym = [_TMP_FAR[0], _TMP_FAR[1], _TMP_FAR[2]];
      Geometry.mirrorPoint(nearSym, mesh.getSymmetryOrigin(), mesh.getSymmetryNormal());
      Geometry.mirrorPoint(farSym, mesh.getSymmetryOrigin(), mesh.getSymmetryNormal());
      var newSym = Geometry.vertexOnLine(this._xrMoveLastSym, nearSym, farSym);
      vec3.sub(_TMP_DIR, newSym, this._xrMoveLastSym);
      vec3.copy(this._xrMoveLastSym, newSym);
      this._clampVec(_TMP_DIR, radius * 0.35);
      vec3.add(this._xrMoveAccumSym, this._xrMoveAccumSym, _TMP_DIR);
      this._clampVec(this._xrMoveAccumSym, radius * 1.15);

      pickingSym._mesh = mesh;
      pickingSym.updateAlpha(false);
      pickingSym.setIdAlpha(this._idAlpha);
      this._copyProxyIndices(this._xrMoveIVertsSym, this._moveDataSym);
      vec3.scale(this._moveDataSym.dir, this._xrMoveAccumSym, this._intensity);
      this.move(this._xrMoveIVertsSym, this._moveDataSym.center, this._xrMoveRadius2, this._moveDataSym, pickingSym);
    }

    mesh.updateGeometry(mesh.getFacesFromVertices(this._xrMoveIVerts), this._xrMoveIVerts);
    if (useSym && this._xrMoveIVertsSym)
      mesh.updateGeometry(mesh.getFacesFromVertices(this._xrMoveIVertsSym), this._xrMoveIVertsSym);
    this.updateMeshBuffers();
  }

  end() {
    this._xrMoveActive = false;
    this._xrMoveIVerts = null;
    this._xrMoveIVertsSym = null;
    this._xrMoveLast = null;
    this._xrMoveLastSym = null;
    this._xrMoveAccum = null;
    this._xrMoveAccumSym = null;
    this._xrMoveRadius2 = 0;
    SculptBase.prototype.end.call(this);
  }
}

export default Move;
