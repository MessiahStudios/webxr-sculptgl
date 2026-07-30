import { vec3, mat4 } from 'gl-matrix';
import getOptionsURL from 'misc/getOptionsURL';
import Enums from 'misc/Enums';
import Utils from 'misc/Utils';
import SculptManager from 'editing/SculptManager';
import Subdivision from 'editing/Subdivision';
import Import from 'files/Import';
import Gui from 'gui/Gui';
import Camera from 'math3d/Camera';
import Picking from 'math3d/Picking';
import Background from 'drawables/Background';
import Mesh from 'mesh/Mesh';
import Multimesh from 'mesh/multiresolution/Multimesh';
import Primitives from 'drawables/Primitives';
import StateManager from 'states/StateManager';
import RenderData from 'mesh/RenderData';
import Rtt from 'drawables/Rtt';
import ShaderLib from 'render/ShaderLib';
import MeshStatic from 'mesh/meshStatic/MeshStatic';
import WebGLCaps from 'render/WebGLCaps';
import WebXRSession from 'xr/WebXRSession';
import XRSetup from 'xr/XRSetup';
import XRRemoteLog from 'xr/XRRemoteLog';
import Export from 'files/Export';
import XRProjectStore from 'xr/XRProjectStore';
import { saveAs } from 'file-saver';

class Scene {

  constructor() {
    this._gl = null; // webgl context

    this._xrControllerModels = null;
    this._xrSessionActive = false;
    this._xrSessionMode = null; // 'immersive-ar' | 'immersive-vr' while in XR (for shaders / UI)
    this._xrPassthroughComposite = false; // true when passthrough / alpha-blend compositing (skip skybox + grid)
    this._xrStageMatrix = mat4.create();
    this._xrEntryScale = 1.0;
    this._xrDistanceOffset = 0.0;
    this._xrOrbitYaw = 0.0;
    this._xrOrbitPitch = 0.0;
    this._xrOrbitViewOffset = [0.0, 0.0, 0.0];
    this._xrEnterFeedbackUntil = 0;
    this._xrSculpting = false;
    this._xrSmoothLatch = false;
    this._xrToolBeforeSmooth = -1;
    this._xrSmoothHold = false;
    this._xrSculptLogged = false;
    this._xrSculptDiagAt = 0;
    this._xrTriggerLatched = false;
    this._xrTriggerReleaseFrames = 0;
    this._xrRayNear = null;
    this._xrRayFar = null;
    this._xrRayUp = null;
    this._xrRayRight = null;
    this._xrRightStickX = 0;
    this._xrRightStickY = 0;
    mat4.identity(this._xrStageMatrix);
    mat4.translate(this._xrStageMatrix, this._xrStageMatrix, [0.0, 1.25, -0.65]);

    this._cameraSpeed = 0.25;

    // cache canvas stuffs
    this._pixelRatio = 1.0;
    this._viewport = document.getElementById('viewport');
    this._canvas = document.getElementById('canvas');
    this._canvasWidth = 0;
    this._canvasHeight = 0;
    this._canvasOffsetLeft = 0;
    this._canvasOffsetTop = 0;

    // core of the app
    this._stateManager = new StateManager(this); // for undo-redo
    this._sculptManager = null;
    this._camera = new Camera(this);
    this._picking = new Picking(this); // the ray picking
    this._pickingSym = new Picking(this, true); // the symmetrical picking

    // TODO primitive builder
    this._meshPreview = null;
    this._torusLength = 0.5;
    this._torusWidth = 0.1;
    this._torusRadius = Math.PI * 2;
    this._torusRadial = 32;
    this._torusTubular = 128;

    // renderable stuffs
    var opts = getOptionsURL();
    this._showContour = opts.outline;
    this._showGrid = opts.grid;
    this._grid = null;
    this._background = null;
    this._meshes = []; // the meshes
    this._selectMeshes = []; // multi selection
    this._mesh = null; // the selected mesh

    this._rttContour = null; // rtt for contour
    this._rttMerge = null; // rtt decode opaque + merge transparent
    this._rttOpaque = null; // rtt half float
    this._rttTransparent = null; // rtt rgbm

    // ui stuffs
    this._focusGui = false; // if the gui is being focused
    this._gui = new Gui(this);

    this._preventRender = false; // prevent multiple render per frame
    this._drawFullScene = false; // render everything on the rtt
    this._autoMatrix = opts.scalecenter; // scale and center the imported meshes
    this._vertexSRGB = true; // srgb vs linear colorspace for vertex color
  }

  start() {
    this.initWebGL();
    if (!this._gl)
      return;

    this._sculptManager = new SculptManager(this);
    this._background = new Background(this._gl, this);

    this._rttContour = new Rtt(this._gl, Enums.Shader.CONTOUR, null);
    this._rttMerge = new Rtt(this._gl, Enums.Shader.MERGE, null);
    this._rttOpaque = new Rtt(this._gl, Enums.Shader.FXAA);
    this._rttTransparent = new Rtt(this._gl, null, this._rttOpaque.getDepth(), true);

    this._grid = Primitives.createGrid(this._gl);
    this.initGrid();

    this.loadTextures();
    this._gui.initGui();
    this.onCanvasResize();

    var modelURL = getOptionsURL().modelurl;
    if (modelURL) this.addModelURL(modelURL);
    else this.addSphere();

    this._webXR = new WebXRSession(this);
    this._webXR.initUI();
  }

  addModelURL(url) {
    var fileType = this.getFileType(url);
    if (!fileType) {
      console.warn('addModelURL: unknown type', url);
      XRRemoteLog.see('MR', 'Import URL failed — unknown type', { url: String(url).slice(0, 120) });
      return;
    }

    XRRemoteLog.see('MR', 'Import URL fetching…', { type: fileType, url: String(url).slice(0, 120) });

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);

    xhr.responseType = (fileType === 'obj' || fileType === 'gltf') ? 'text' : 'arraybuffer';

    var self = this;
    xhr.onload = function () {
      if (xhr.status === 200 || xhr.status === 0) {
        var result = self.loadScene(xhr.response, fileType);
        if (result && typeof result.then === 'function') {
          result.then(function () {
            XRRemoteLog.see('MR', 'Import URL loaded', { type: fileType });
          }).catch(function (err) {
            console.warn('addModelURL failed', err);
            XRRemoteLog.see('MR', 'Import URL parse failed', {
              type: fileType,
              err: err && err.message ? err.message : String(err)
            });
          });
        } else {
          XRRemoteLog.see('MR', 'Import URL loaded', { type: fileType });
        }
      } else {
        console.warn('addModelURL HTTP', xhr.status, url);
        XRRemoteLog.see('MR', 'Import URL HTTP error', { status: xhr.status });
      }
    };

    xhr.onerror = function () {
      console.warn('addModelURL network error', url);
      XRRemoteLog.see('MR', 'Import URL network/CORS error', { url: String(url).slice(0, 120) });
    };

    xhr.send(null);
  }

  getBackground() {
    return this._background;
  }

  getViewport() {
    return this._viewport;
  }

  getCanvas() {
    return this._canvas;
  }

  getGL() {
    return this._gl;
  }

  setXRSessionActive(active) {
    this._xrSessionActive = !!active;
    if (!active) {
      this._xrSessionMode = null;
      this._xrPassthroughComposite = false;
    }
  }

  isXRSessionActive() {
    return this._xrSessionActive;
  }

  /** @returns {string|null} WebXR session.mode while active */
  getXRSessionMode() {
    return this._xrSessionMode;
  }

  /** True during draw when the runtime composites over the real world (MR / passthrough). */
  isXRPassthroughComposite() {
    return !!this._xrPassthroughComposite;
  }

  /**
   * Recenter XR stage from current visible meshes.
   * Places clay IN FRONT of the user — never large enough to put the head inside the mesh.
   */
  fitXRStageToScene() {
    var box = this.computeBoundingBoxMeshes(this._meshes);
    if (!isFinite(box[0])) {
      this._xrStageFit = {
        centerX: 0, centerY: 0, centerZ: 0,
        scale: 1, distance: 0.85, radius: 1
      };
      this._rebuildXRStageMatrix();
      return;
    }

    var centerX = (box[0] + box[3]) * 0.5;
    var centerY = (box[1] + box[4]) * 0.5;
    var centerZ = (box[2] + box[5]) * 0.5;
    var radius = Math.max(0.1, this.computeRadiusFromBoundingBox(box));
    // Perceived clay radius in meters — large enough to sculpt comfortably at arm's reach.
    var targetRadius = 0.34;
    var scale = (targetRadius / radius) * this._xrEntryScale;
    scale = Math.min(2.5, Math.max(0.0004, scale));
    var scaledRadius = radius * scale;
    // Distance to mesh CENTER must exceed scaledRadius or you stand inside the clay.
    var clearance = 0.55; // meters from headset to nearest surface
    var distance = scaledRadius + clearance + this._xrDistanceOffset;
    distance = Math.min(2.6, Math.max(scaledRadius + 0.4, distance));

    this._xrStageFit = {
      centerX: centerX, centerY: centerY, centerZ: centerZ,
      scale: scale, distance: distance, radius: radius,
      scaledRadius: scaledRadius
    };
    this._rebuildXRStageMatrix();
  }

  /** Apply distance/scale/orbit into _xrStageMatrix. */
  _rebuildXRStageMatrix() {
    var f = this._xrStageFit || {
      centerX: 0, centerY: 0, centerZ: 0,
      scale: 1, distance: 0.85, radius: 1, scaledRadius: 1
    };
    var off = this._xrOrbitViewOffset || [0.0, 0.0, 0.0];
    // Orbit rotates about selection COM (f.center*). View offset keeps the room stable when that
    // COM is updated after Transform (otherwise T(-C) changes → snap).
    mat4.identity(this._xrStageMatrix);
    mat4.translate(this._xrStageMatrix, this._xrStageMatrix, [0.0, 1.25, -f.distance]);
    mat4.translate(this._xrStageMatrix, this._xrStageMatrix, off);
    mat4.rotateY(this._xrStageMatrix, this._xrStageMatrix, this._xrOrbitYaw || 0);
    mat4.rotateX(this._xrStageMatrix, this._xrStageMatrix, this._xrOrbitPitch || 0);
    mat4.scale(this._xrStageMatrix, this._xrStageMatrix, [f.scale, f.scale, f.scale]);
    mat4.translate(this._xrStageMatrix, this._xrStageMatrix, [-f.centerX, -f.centerY, -f.centerZ]);

    var scaledR = f.scaledRadius != null ? f.scaledRadius : (f.radius * f.scale);
    this._xrStageDesc = {
      height_m: 1.25,
      distance_ahead_m: Math.round(f.distance * 100) / 100,
      scale: Math.round(f.scale * 100000) / 100000,
      mesh_center: [
        Math.round(f.centerX * 100) / 100,
        Math.round(f.centerY * 100) / 100,
        Math.round(f.centerZ * 100) / 100
      ],
      mesh_radius: Math.round(f.radius * 100) / 100,
      scaled_radius_m: Math.round(scaledR * 1000) / 1000,
      surface_clearance_m: Math.round((f.distance - scaledR) * 1000) / 1000,
      orbit_yaw: Math.round((this._xrOrbitYaw || 0) * 100) / 100,
      orbit_pitch: Math.round((this._xrOrbitPitch || 0) * 100) / 100
    };
  }

  /** Human-readable stage placement for MR/VR view logs. */
  describeXRStagePlacement() {
    if (this._xrStageDesc) return this._xrStageDesc;
    return {
      height_m: 1.25,
      distance_ahead_m: 0.85,
      scale: 1,
      note: 'default stage (no mesh bounds yet)'
    };
  }

  recenterXRStage() {
    this._xrOrbitYaw = 0.0;
    this._xrOrbitPitch = 0.0;
    this._xrDistanceOffset = 0.0;
    this._xrEntryScale = 1.0;
    this._xrOrbitViewOffset = [0.0, 0.0, 0.0];
    this.fitXRStageToScene();
  }

  /**
   * Point the XR orbit pivot at the selection COM (bbox center).
   * When the COM moves (Transform bake / reselect), compensate the view translation so the
   * clay does not jump in the room — then stick orbit feels like turning around the object.
   * @param {boolean} [compensate=true]
   */
  syncXROrbitPivotToSelection(compensate) {
    var meshes = this.getSelectedMeshes();
    if (!meshes || meshes.length === 0) {
      var one = this.getMesh();
      meshes = one ? [one] : this.getMeshes();
    }
    if (!meshes || !meshes.length) return;
    var box = this.computeBoundingBoxMeshes(meshes);
    if (!isFinite(box[0])) return;

    var cx = (box[0] + box[3]) * 0.5;
    var cy = (box[1] + box[4]) * 0.5;
    var cz = (box[2] + box[5]) * 0.5;

    if (!this._xrStageFit) {
      this.fitXRStageToScene();
      return;
    }

    var f = this._xrStageFit;
    var oldCx = f.centerX;
    var oldCy = f.centerY;
    var oldCz = f.centerZ;
    var ddx = cx - oldCx;
    var ddy = cy - oldCy;
    var ddz = cz - oldCz;
    if (Math.abs(ddx) + Math.abs(ddy) + Math.abs(ddz) < 1e-7)
      return;

    if (compensate !== false) {
      // Matrix order: T * offset * Ry * Rx * S * T(-C)
      // Changing C→C' shifts content by R*(S*(C-C')) = -R*S*(C'-C). Add +R*S*(C'-C) to offset.
      var s = f.scale || 1;
      var x = ddx * s;
      var y = ddy * s;
      var z = ddz * s;
      var pitch = this._xrOrbitPitch || 0;
      var yaw = this._xrOrbitYaw || 0;
      var cosP = Math.cos(pitch);
      var sinP = Math.sin(pitch);
      var y1 = y * cosP - z * sinP;
      var z1 = y * sinP + z * cosP;
      var cosY = Math.cos(yaw);
      var sinY = Math.sin(yaw);
      var x2 = x * cosY + z1 * sinY;
      var z2 = -x * sinY + z1 * cosY;
      if (!this._xrOrbitViewOffset)
        this._xrOrbitViewOffset = [0.0, 0.0, 0.0];
      this._xrOrbitViewOffset[0] += x2;
      this._xrOrbitViewOffset[1] += y1;
      this._xrOrbitViewOffset[2] += z2;
    }

    f.centerX = cx;
    f.centerY = cy;
    f.centerZ = cz;
  }

  /**
   * Right stick: X = orbit yaw around selection COM,
   * Y = dolly along the line from object → headset (not fixed stage Z).
   * @param {number} dx
   * @param {number} dy
   * @param {{x:number,y:number,z:number}|null} [viewerPos] headset position in ref space
   */
  orbitXRStage(dx, dy, viewerPos) {
    var dead = 0.18;
    if (Math.abs(dx) < dead) dx = 0;
    if (Math.abs(dy) < dead) dy = 0;
    if (!dx && !dy) return;

    // Keep pivot on selection COM; compensate so re-anchor after Transform doesn't snap.
    this.syncXROrbitPivotToSelection(true);

    if (dx)
      this._xrOrbitYaw += dx * 0.045;

    // Stick Y: move sculpture along viewer↔object axis (toward/away from what you're looking at).
    if (dy)
      this._dollyXRAlongView(dy, viewerPos);

    if (!this._xrStageFit) this.fitXRStageToScene();
    else this._rebuildXRStageMatrix();
  }

  /**
   * Dolly closer/farther along the headset → selection line (ref space).
   * Stick up (typically dy < 0) → closer; stick down → farther.
   */
  _dollyXRAlongView(dy, viewerPos) {
    if (!this._xrOrbitViewOffset)
      this._xrOrbitViewOffset = [0.0, 0.0, 0.0];

    // Selection COM in ref space (maps to eye + offset after stage matrix).
    var f = this._xrStageFit;
    if (!f) return;
    var off = this._xrOrbitViewOffset;
    var comX = off[0];
    var comY = 1.25 + off[1];
    var comZ = -f.distance + off[2];

    var hx = viewerPos ? viewerPos.x : 0.0;
    var hy = viewerPos ? viewerPos.y : 1.6;
    var hz = viewerPos ? viewerPos.z : 0.0;

    var dirX = hx - comX;
    var dirY = hy - comY;
    var dirZ = hz - comZ;
    var len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
    if (len < 1e-4) {
      // Fallback: toward +Z (user behind sculpture on default stage).
      dirX = 0; dirY = 0; dirZ = 1; len = 1;
    } else {
      dirX /= len; dirY /= len; dirZ /= len;
    }

    // Stick up → closer (move COM toward head). Keep a minimum separation.
    var amount = -dy * 0.04;
    var newDist = len - amount;
    if (newDist < 0.35) amount = len - 0.35;
    if (newDist > 3.5) amount = len - 3.5;

    off[0] += dirX * amount;
    off[1] += dirY * amount;
    off[2] += dirZ * amount;
  }

  /**
   * Pitch tilt only (Workspace squeeze + stick Y) — keep separate from view dolly.
   */
  tiltXRStage(dy) {
    var dead = 0.18;
    if (Math.abs(dy) < dead) return;
    this._xrOrbitPitch += dy * 0.035;
    var lim = 1.25;
    if (this._xrOrbitPitch > lim) this._xrOrbitPitch = lim;
    if (this._xrOrbitPitch < -lim) this._xrOrbitPitch = -lim;
    if (!this._xrStageFit) this.fitXRStageToScene();
    else this._rebuildXRStageMatrix();
  }

  /** Dolly stage distance (Workspace tab) without recomputing scale/center from the full scene. */
  _adjustXRViewDistance(delta) {
    this._xrDistanceOffset = Math.min(1.8, Math.max(-0.8, this._xrDistanceOffset + delta));
    if (!this._xrStageFit) {
      this.fitXRStageToScene();
      return;
    }
    var f = this._xrStageFit;
    var scaledR = f.scaledRadius != null ? f.scaledRadius : (f.radius * f.scale);
    var clearance = 0.55;
    var distance = scaledR + clearance + this._xrDistanceOffset;
    f.distance = Math.min(2.6, Math.max(scaledR + 0.4, distance));
  }

  /**
   * Pure yaw turntable (Workspace) — rotates the sculpture in place without tilting.
   * @param {number} dx stick X (-1..1)
   */
  turntableXRStage(dx) {
    var dead = 0.18;
    if (Math.abs(dx) < dead) return;
    this._xrOrbitYaw += dx * 0.05;
    if (!this._xrStageFit) this.fitXRStageToScene();
    else this._rebuildXRStageMatrix();
  }

  offsetXRDistance(delta) {
    this._adjustXRViewDistance(delta);
    if (!this._xrStageFit) this.fitXRStageToScene();
    else this._rebuildXRStageMatrix();
  }

  scaleXRStage(mult) {
    this._xrEntryScale = Math.min(3.0, Math.max(0.25, this._xrEntryScale * mult));
    this.fitXRStageToScene();
  }

  /** Flash enter-session scale feedback on the dock for a few seconds. */
  markXRWorkspaceEnterFeedback(ms) {
    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    this._xrEnterFeedbackUntil = now + (ms || 8000);
  }

  /**
   * Live Workspace HUD numbers for the dock (scale %, size cm, distance, yaw).
   * @returns {{scalePct:number, sizeCm:number, distanceM:number, yawDeg:number, pitchDeg:number, entryHint:boolean, line:string}}
   */
  getXRWorkspaceHud() {
    var d = this.describeXRStagePlacement();
    var sizeM = d.scaled_radius_m != null ? d.scaled_radius_m : 0.34;
    var entry = this._xrEntryScale != null ? this._xrEntryScale : 1;
    var scalePct = Math.round(entry * 100);
    var sizeCm = Math.round(sizeM * 100);
    var distanceM = d.distance_ahead_m != null ? d.distance_ahead_m : 0.85;
    var yawDeg = Math.round(((d.orbit_yaw || 0) * 180) / Math.PI);
    var pitchDeg = Math.round(((d.orbit_pitch || 0) * 180) / Math.PI);
    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var entryHint = !!(this._xrEnterFeedbackUntil && now < this._xrEnterFeedbackUntil);
    var line = 'Scale ' + scalePct + '%  ·  ~' + sizeCm + 'cm  ·  Dist ' + distanceM + 'm  ·  Yaw ' + yawDeg + '°';
    return {
      scalePct: scalePct,
      sizeCm: sizeCm,
      distanceM: distanceM,
      yawDeg: yawDeg,
      pitchDeg: pitchDeg,
      entryHint: entryHint,
      line: line
    };
  }

  getPixelRatio() {
    return this._pixelRatio;
  }

  getCanvasWidth() {
    return this._canvasWidth;
  }

  getCanvasHeight() {
    return this._canvasHeight;
  }

  getCamera() {
    return this._camera;
  }

  /** Default webxr-input-profiles id when the runtime profile is generic or unknown. */
  getXRControllerProfileFallback() {
    return XRSetup.resolveProfileFallback(XRSetup.readSavedProfileChoice());
  }

  /** Warm Three + controller chunk (keeps main bundle smaller for mobile browsers). */
  preloadXRControllers() {
    if (this._xrControllerModels) return;
    import(/* webpackChunkName: "xr-three" */ 'xr/XRControllerModels')
      .then(function (mod) {
        if (!this._xrControllerModels)
          this._xrControllerModels = new mod.default(this);
      }.bind(this))
      .catch(function () {});
  }

  getGui() {
    return this._gui;
  }

  getMeshes() {
    return this._meshes;
  }

  getMesh() {
    return this._mesh;
  }

  getSelectedMeshes() {
    return this._selectMeshes;
  }

  getPicking() {
    return this._picking;
  }

  getPickingSymmetry() {
    return this._pickingSym;
  }

  getSculptManager() {
    return this._sculptManager;
  }

  getStateManager() {
    return this._stateManager;
  }

  setMesh(mesh) {
    return this.setOrUnsetMesh(mesh);
  }

  setCanvasCursor(style) {
    this._canvas.style.cursor = style;
  }

  initGrid() {
    var grid = this._grid;
    grid.normalizeSize();
    var gridm = grid.getMatrix();
    mat4.translate(gridm, gridm, [0.0, -0.45, 0.0]);
    var scale = 2.5;
    mat4.scale(gridm, gridm, [scale, scale, scale]);
    this._grid.setShaderType(Enums.Shader.FLAT);
    grid.setFlatColor([0.04, 0.04, 0.04]);
  }

  setOrUnsetMesh(mesh, multiSelect) {
    if (!mesh) {
      this._selectMeshes.length = 0;
    } else if (!multiSelect) {
      this._selectMeshes.length = 0;
      this._selectMeshes.push(mesh);
    } else {
      var id = this.getIndexSelectMesh(mesh);
      if (id >= 0) {
        if (this._selectMeshes.length > 1) {
          this._selectMeshes.splice(id, 1);
          mesh = this._selectMeshes[0];
        }
      } else {
        this._selectMeshes.push(mesh);
      }
    }

    this._mesh = mesh;
    this.getGui().updateMesh();
    this.render();
    return mesh;
  }

  renderSelectOverRtt() {
    if (this._requestRender())
      this._drawFullScene = false;
  }

  _requestRender() {
    if (this._xrSessionActive)
      return false;
    if (this._preventRender === true)
      return false; // render already requested for the next frame

    window.requestAnimationFrame(this.applyRender.bind(this));
    this._preventRender = true;
    return true;
  }

  render() {
    this._drawFullScene = true;
    this._requestRender();
  }

  applyRender() {
    this._preventRender = false;
    if (this._xrSessionActive)
      return;

    this.updateMatricesAndSort();

    var gl = this._gl;
    if (!gl) return;

    if (this._drawFullScene) this._drawScene();

    gl.disable(gl.DEPTH_TEST);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._rttMerge.getFramebuffer());
    this._rttMerge.render(this); // merge + decode

    // render to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this._rttOpaque.render(this); // fxaa

    gl.enable(gl.DEPTH_TEST);

    this._sculptManager.postRender(); // draw sculpting gizmo stuffs
  }

  _drawScene() {
    var gl = this._gl;
    var i = 0;
    var meshes = this._meshes;
    var nbMeshes = meshes.length;

    ///////////////
    // CONTOUR 1/2
    ///////////////
    gl.disable(gl.DEPTH_TEST);
    var showContour = this._selectMeshes.length > 0 && this._showContour && ShaderLib[Enums.Shader.CONTOUR].color[3] > 0.0;
    if (showContour) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._rttContour.getFramebuffer());
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (var s = 0, sel = this._selectMeshes, nbSel = sel.length; s < nbSel; ++s)
        sel[s].renderFlatColor(this);
    }
    gl.enable(gl.DEPTH_TEST);

    ///////////////
    // OPAQUE PASS
    ///////////////
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._rttOpaque.getFramebuffer());
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // grid
    if (this._showGrid) this._grid.render(this);

    // (post opaque pass)
    for (i = 0; i < nbMeshes; ++i) {
      if (meshes[i].isTransparent()) break;
      meshes[i].render(this);
    }
    var startTransparent = i;
    if (this._meshPreview) this._meshPreview.render(this);

    // background
    this._background.render();

    ///////////////
    // TRANSPARENT PASS
    ///////////////
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._rttTransparent.getFramebuffer());
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);

    // wireframe for dynamic mesh has duplicate edges
    gl.depthFunc(gl.LESS);
    for (i = 0; i < nbMeshes; ++i) {
      if (meshes[i].getShowWireframe())
        meshes[i].renderWireframe(this);
    }
    gl.depthFunc(gl.LEQUAL);

    gl.depthMask(false);
    gl.enable(gl.CULL_FACE);

    for (i = startTransparent; i < nbMeshes; ++i) {
      gl.cullFace(gl.FRONT); // draw back first
      meshes[i].render(this);
      gl.cullFace(gl.BACK); // ... and then front
      meshes[i].render(this);
    }

    gl.disable(gl.CULL_FACE);

    ///////////////
    // CONTOUR 2/2
    ///////////////
    if (showContour) {
      this._rttContour.render(this);
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  /**
   * Right thumbstick: orbit yaw around selection COM (X) + dolly along view (Y).
   * Only paused while a stroke is active (or Smooth-hold) so grabs aren't fought.
   */
  updateXROrbitInput(frame, session, refSpace) {
    if (!session || !frame) return;
    if (this._xrSculpting) return;
    if (this._xrSmoothHold) return;
    var viewerPos = null;
    try {
      var viewer = refSpace ? frame.getViewerPose(refSpace) : null;
      var p = viewer && viewer.transform && viewer.transform.position;
      if (p) viewerPos = { x: p.x, y: p.y, z: p.z };
    } catch (e) { /* optional */ }
    var sources = session.inputSources;
    var i;
    for (i = 0; i < sources.length; ++i) {
      var src = sources[i];
      if (src.handedness !== 'right' || !src.gamepad) continue;
      var a = src.gamepad.axes;
      if (!a || a.length < 2) return;
      // Quest Touch: thumbstick is usually axes[2], axes[3]
      var x = a.length >= 4 ? (a[2] || 0) : (a[0] || 0);
      var y = a.length >= 4 ? (a[3] || 0) : (a[1] || 0);
      this.orbitXRStage(x, y, viewerPos);
      return;
    }
  }

  _applyXRSmoothHold(want) {
    var sm = this.getSculptManager();
    this._xrSmoothHold = !!want;
    if (want) {
      if (this._xrSmoothLatch) return;
      var cur = sm.getToolIndex();
      // Transform keeps its own grab grammar — don't steal it for Smooth-hold.
      if (cur === Enums.Tools.TRANSFORM) return;
      if (cur === Enums.Tools.SMOOTH) {
        this._xrSmoothLatch = true;
        this._xrToolBeforeSmooth = -1;
        return;
      }
      this._xrToolBeforeSmooth = cur;
      sm.setToolIndex(Enums.Tools.SMOOTH);
      this._xrSmoothLatch = true;
      XRRemoteLog.see('MR', 'SMOOTH hold — both grips (release to restore tool)');
      return;
    }
    if (!this._xrSmoothLatch) return;
    if (this._xrSculpting) {
      this._xrSculpting = false;
      sm.end();
    }
    if (this._xrToolBeforeSmooth >= 0 && sm.getToolIndex() === Enums.Tools.SMOOTH)
      sm.setToolIndex(this._xrToolBeforeSmooth);
    this._xrToolBeforeSmooth = -1;
    this._xrSmoothLatch = false;
  }

  /** XR undo — same path as desktop GuiStates.onUndo. */
  undoXR() {
    this._action = Enums.Action.NOTHING;
    if (this._xrSculpting) {
      this._xrSculpting = false;
      this.getSculptManager().end();
    }
    this.getStateManager().undo();
    XRRemoteLog.see('MR', 'Undo');
  }

  /** XR redo — same path as desktop GuiStates.onRedo. */
  redoXR() {
    this.getStateManager().redo();
    XRRemoteLog.see('MR', 'Redo');
  }

  /** XR paint-all — fill unmasked vertices with current color / PBR (desktop Paint.paintAll). */
  paintAllXR() {
    var sm = this.getSculptManager();
    if (sm.getToolIndex() !== Enums.Tools.PAINT)
      sm.setToolIndex(Enums.Tools.PAINT);
    var tool = sm.getCurrentTool();
    if (!tool || typeof tool.paintAll !== 'function') {
      XRRemoteLog.see('MR', 'Paint All unavailable');
      return;
    }
    var mesh = this.getMesh() || (this.getPicking() && this.getPicking().getMesh());
    if (!mesh) {
      XRRemoteLog.see('MR', 'Paint All — aim at clay first so a mesh is selected');
      return;
    }
    this.setMesh(mesh);
    tool.paintAll();
    this.render();
    XRRemoteLog.see('MR', 'Paint All — filled unmasked surface');
  }

  _endXRSculptStroke() {
    this._action = Enums.Action.NOTHING;
    if (this._xrSculpting) {
      this._xrSculpting = false;
      this.getSculptManager().end();
    }
  }

  /**
   * Save current meshes as .sgl into origin IndexedDB (Load last).
   * @returns {Promise<{ name: string, bytes: number, meshCount: number }>}
   */
  saveXRProject() {
    var self = this;
    this._endXRSculptStroke();
    var meshes = this.getMeshes();
    if (!meshes || !meshes.length) {
      XRRemoteLog.see('MR', 'Save failed — no meshes');
      return Promise.reject(new Error('No meshes to save'));
    }
    var blob = Export.exportSGL(meshes, this);
    var name = XRProjectStore.stampName('sgl');
    return XRProjectStore.saveLastProject(blob, {
      name: name,
      meshCount: meshes.length
    }).then(function (rec) {
      XRRemoteLog.see('MR', 'Project SAVED (.sgl → IndexedDB)', {
        name: rec.name,
        bytes: rec.bytes,
        meshes: rec.meshCount
      });
      self.render();
      return { name: rec.name, bytes: rec.bytes, meshCount: rec.meshCount };
    });
  }

  /**
   * Replace scene with last IndexedDB .sgl project, then re-fit XR stage.
   * @returns {Promise<{ name: string, bytes: number, meshCount: number }>}
   */
  loadXRProject() {
    var self = this;
    this._endXRSculptStroke();
    return XRProjectStore.loadLastProject().then(function (rec) {
      if (!rec || !rec.blob) {
        XRRemoteLog.see('MR', 'Load failed — nothing saved yet');
        return Promise.reject(new Error('No saved project'));
      }
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var prevAuto = self._autoMatrix;
            self._autoMatrix = false;
            self.clearScene();
            var loaded = self.loadScene(reader.result, 'sgl');
            self._autoMatrix = prevAuto;
            if (!loaded || !loaded.length) {
              XRRemoteLog.see('MR', 'Load failed — empty .sgl');
              reject(new Error('Empty project'));
              return;
            }
            self.fitXRStageToScene();
            self.render();
            XRRemoteLog.see('MR', 'Project LOADED (.sgl) — replaced scene', {
              name: rec.name,
              bytes: rec.bytes,
              meshes: loaded.length
            });
            resolve({
              name: rec.name,
              bytes: rec.bytes,
              meshCount: loaded.length
            });
          } catch (err) {
            XRRemoteLog.see('MR', 'Load failed', { error: String(err && err.message || err) });
            reject(err);
          }
        };
        reader.onerror = function () {
          reject(reader.error || new Error('Failed to read saved blob'));
        };
        reader.readAsArrayBuffer(rec.blob);
      });
    });
  }

  /**
   * Export meshes for other apps via browser download → Quest Files when allowed.
   * Formats only carry what they permit — see Export.formatInfo.
   * @param {'obj'|'obj-maps'|'ply'|'stl'} fmt
   * @returns {{ name: string, fmt: string, bytes: number }|Promise<{name:string,fmt:string,bytes:number}>}
   */
  exportXRMesh(fmt) {
    this._endXRSculptStroke();
    var meshes = this.getMeshes();
    if (!meshes || !meshes.length)
      throw new Error('No meshes to export');
    var f = (fmt || 'obj').toLowerCase();

    if (f === 'obj-maps' || f === 'objmaps' || f === 'obj+maps') {
      var self = this;
      var base = XRProjectStore.stampName('obj').replace(/\.obj$/i, '');
      return Export.exportOBJMapsZip(this, meshes, {
        baseName: base,
        texSize: 1024,
        colorZbrush: true,
        colorAppend: false
      }).then(function (out) {
        XRRemoteLog.see('MR', 'Exported OBJ+maps zip (browser download)', {
          name: out.name,
          bytes: out.bytes,
          baked: out.baked,
          skipped: out.skipped,
          payload: Export.formatInfo.detail('obj-maps')
        });
        return { name: out.name, fmt: 'obj-maps', bytes: out.bytes };
      }).catch(function (err) {
        XRRemoteLog.see('MR', 'OBJ+maps export failed', {
          error: (err && err.message) || String(err)
        });
        throw err;
      });
    }

    var blob;
    var ext;
    if (f === 'ply') {
      blob = Export.exportBinaryPLY(meshes);
      ext = 'ply';
    } else if (f === 'stl') {
      blob = Export.exportBinarySTL(meshes);
      ext = 'stl';
    } else {
      blob = Export.exportOBJ(meshes, true, false);
      ext = 'obj';
    }
    var name = XRProjectStore.stampName(ext);
    saveAs(blob, name);
    XRRemoteLog.see('MR', 'Exported .' + ext + ' (browser download)', {
      name: name,
      bytes: blob.size,
      meshes: meshes.length,
      payload: Export.formatInfo.detail(ext)
    });
    return { name: name, fmt: ext, bytes: blob.size };
  }

  /** Empty the scene (desktop clear). Leaves no clay until Add shape. */
  clearXRScene() {
    this._endXRSculptStroke();
    this.clearScene();
    this.fitXRStageToScene();
    this.render();
    XRRemoteLog.see('MR', 'Scene CLEARED');
  }

  /**
   * Open the desktop/browser file picker (OBJ/PLY/STL/SGL/GLB).
   * Quest: unreliable inside immersive MR/VR — prefer import before XR or after exit.
   */
  importXRFilePicker() {
    this._endXRSculptStroke();
    var el = document.getElementById('fileopen');
    if (!el) throw new Error('File picker unavailable');
    XRRemoteLog.see('MR', 'Import file picker opened — may fail in immersive XR; prefer before enter', {
      formats: 'obj,ply,stl,sgl,glb,gltf',
      adds_to_scene: true
    });
    el.click();
  }

  /**
   * Add a primitive like desktop Topology (sphere / cube / cylinder / torus).
   * @param {'sphere'|'cube'|'cylinder'|'torus'} kind
   */
  addXRShape(kind) {
    this._endXRSculptStroke();
    var k = (kind || 'sphere').toLowerCase();
    var mesh = null;
    if (k === 'cube') mesh = this.addCube();
    else if (k === 'cylinder') mesh = this.addCylinder();
    else if (k === 'torus') {
      this.addTorus(false);
      mesh = this.getMesh();
    } else {
      mesh = this.addSphere();
    }
    this.fitXRStageToScene();
    this.render();
    XRRemoteLog.see('MR', 'Added shape → ' + k, {
      meshes: this.getMeshes().length
    });
    return mesh;
  }

  /**
   * Right-hand main trigger only → scene-space ray → desktop sculpt tools.
   * Left hand is reserved for the Sculpt Dock (no sculpt fallback).
   */
  updateXRSculptInput(frame, session, refSpace) {
    if (!session || !refSpace || !frame) return;

    var sources = session.inputSources;
    var i;
    var chosen = null;
    var triggerValue = 0;
    var leftGrip = false;
    var rightGrip = false;
    this._xrMultiSelect = false;
    for (i = 0; i < sources.length; ++i) {
      var srcScan = sources[i];
      var gpScan = srcScan.gamepad;
      if (gpScan && gpScan.buttons && gpScan.buttons[1]) {
        var sq = gpScan.buttons[1];
        if (sq.pressed || sq.value > 0.55) {
          if (srcScan.handedness === 'left') leftGrip = true;
          if (srcScan.handedness === 'right') rightGrip = true;
        }
      }
      if (srcScan.handedness === 'left' && gpScan && gpScan.buttons) {
        // Left index trigger = multi-select modifier (desktop Ctrl) while Transform is active.
        var ltrig = gpScan.buttons[0];
        if (ltrig && (ltrig.pressed || ltrig.value > 0.45))
          this._xrMultiSelect = true;
      }
      if (srcScan.handedness !== 'right' || !srcScan.targetRaySpace) continue;
      var gp = gpScan;
      // Quest: buttons[0] = main (index) trigger
      var btn = gp && gp.buttons && gp.buttons[0];
      triggerValue = btn ? (btn.value || 0) : 0;
      chosen = srcScan;
    }

    // Both grips = temporary Smooth (desktop Shift). Takes priority over right-grip negative.
    this._applyXRSmoothHold(leftGrip && rightGrip);

    // Right grip → temporary negative (skip while Smooth-hold so grips aren't fighting).
    if (!this._xrSmoothHold && this._xrControllerModels && this._xrControllerModels.sampleDockNegative)
      this._xrControllerModels.sampleDockNegative(session);
    else if (this._xrSmoothHold && this._xrControllerModels && this._xrControllerModels.clearDockNegative)
      this._xrControllerModels.clearDockNegative();

    // Hysteresis: avoid micro release/repress restarting Move / Transform.
    // Transform needs multi-frame release — logs still showed gizmo grab restarting
    // every ~1–2s while trigger stayed at 0.6–1.0 (Quest analog jitter dips).
    var toolIdxForTrig = this.getSculptManager().getToolIndex();
    var xfTool = (toolIdxForTrig === Enums.Tools.TRANSFORM) ? this.getSculptManager().getCurrentTool() : null;
    var xfBusy = !!(xfTool && (xfTool._xrMode === 'gizmo' || xfTool._xrMode === 'grab'));
    var transformHold = toolIdxForTrig === Enums.Tools.TRANSFORM && (this._xrSculpting || xfBusy);
    if (this._xrTriggerLatched) {
      var releaseAt = transformHold ? 0.08 : 0.22;
      var needFrames = transformHold ? 5 : 1;
      if (triggerValue < releaseAt) {
        this._xrTriggerReleaseFrames = (this._xrTriggerReleaseFrames || 0) + 1;
        if (this._xrTriggerReleaseFrames >= needFrames)
          this._xrTriggerLatched = false;
      } else {
        this._xrTriggerReleaseFrames = 0;
      }
    } else if (triggerValue > 0.42 || (chosen && chosen.gamepad && chosen.gamepad.buttons[0] && chosen.gamepad.buttons[0].pressed && triggerValue > 0.3)) {
      this._xrTriggerLatched = true;
      this._xrTriggerReleaseFrames = 0;
    }
    var triggerPressed = !!this._xrTriggerLatched;
    // Belt-and-suspenders: never end an active Transform stroke on a one-frame dip.
    if (!triggerPressed && xfBusy && triggerValue > 0.05) {
      triggerPressed = true;
      this._xrTriggerLatched = true;
      this._xrTriggerReleaseFrames = 0;
    }

    if (!chosen) {
      this._xrTriggerLatched = false;
      this._applyXRSmoothHold(false);
      if (this._xrSculpting) {
        this._xrSculpting = false;
        this.getSculptManager().end();
      }
      this.getPicking()._mesh = null;
      this.getPickingSymmetry()._mesh = null;
      return;
    }

    var pose = frame.getPose(chosen.targetRaySpace, refSpace);
    if (!pose) return;

    var m = pose.transform.matrix;
    var originXR = [m[12], m[13], m[14]];
    // WebXR target ray aims along -Z of the pose.
    var dirXR = [-m[8], -m[9], -m[10]];
    var len = Math.sqrt(dirXR[0] * dirXR[0] + dirXR[1] * dirXR[1] + dirXR[2] * dirXR[2]) || 1.0;
    dirXR[0] /= len; dirXR[1] /= len; dirXR[2] /= len;

    var invStage = mat4.create();
    mat4.invert(invStage, this._xrStageMatrix);
    var nearScene = [0.0, 0.0, 0.0];
    var farScene = [0.0, 0.0, 0.0];
    var farXR = [
      originXR[0] + dirXR[0] * 8.0,
      originXR[1] + dirXR[1] * 8.0,
      originXR[2] + dirXR[2] * 8.0
    ];
    vec3.transformMat4(nearScene, originXR, invStage);
    vec3.transformMat4(farScene, farXR, invStage);
    this._xrRayNear = nearScene;
    this._xrRayFar = farScene;
    // Controller basis in scene space — Twist uses wrist roll around the aim axis.
    var upXR = [m[4], m[5], m[6]];
    var rightXR = [m[0], m[1], m[2]];
    var upScene = [
      invStage[0] * upXR[0] + invStage[4] * upXR[1] + invStage[8] * upXR[2],
      invStage[1] * upXR[0] + invStage[5] * upXR[1] + invStage[9] * upXR[2],
      invStage[2] * upXR[0] + invStage[6] * upXR[1] + invStage[10] * upXR[2]
    ];
    var rightScene = [
      invStage[0] * rightXR[0] + invStage[4] * rightXR[1] + invStage[8] * rightXR[2],
      invStage[1] * rightXR[0] + invStage[5] * rightXR[1] + invStage[9] * rightXR[2],
      invStage[2] * rightXR[0] + invStage[6] * rightXR[1] + invStage[10] * rightXR[2]
    ];
    var upLen = Math.sqrt(upScene[0] * upScene[0] + upScene[1] * upScene[1] + upScene[2] * upScene[2]) || 1.0;
    var rightLen = Math.sqrt(rightScene[0] * rightScene[0] + rightScene[1] * rightScene[1] + rightScene[2] * rightScene[2]) || 1.0;
    this._xrRayUp = [upScene[0] / upLen, upScene[1] / upLen, upScene[2] / upLen];
    this._xrRayRight = [rightScene[0] / rightLen, rightScene[1] / rightLen, rightScene[2] / rightLen];
    // Right stick while Twist/LocalScale is active → tool assist (not stage orbit).
    if (chosen.gamepad && chosen.gamepad.axes) {
      var ra = chosen.gamepad.axes;
      if (ra.length >= 4) {
        this._xrRightStickX = ra[2] || 0;
        this._xrRightStickY = ra[3] || 0;
      } else {
        this._xrRightStickX = ra[0] || 0;
        this._xrRightStickY = ra[1] || 0;
      }
    } else {
      this._xrRightStickX = 0;
      this._xrRightStickY = 0;
    }

    var picking = this.getPicking();
    var hit = picking.intersectionSceneRayMeshes(nearScene, farScene);
    var toolIdxHover = this.getSculptManager().getToolIndex();
    var isTransform = toolIdxHover === Enums.Tools.TRANSFORM;

    // Transform: hover gizmo / keep selection feedback even without trigger
    if (isTransform) {
      var xfTool = this.getSculptManager().getCurrentTool();
      if (xfTool && xfTool.preUpdateXR)
        xfTool.preUpdateXR();
    }

    // Keep symmetry pick hot for the red mirror-dot indicator (and for strokes).
    if (hit && this.getSculptManager().getSymmetry() && !isTransform)
      this.getPickingSymmetry().intersectionSceneRayMesh(picking.getMesh(), nearScene, farScene);
    else if (!isTransform)
      this.getPickingSymmetry()._mesh = null;

    // Throttled diagnostics while trigger is held (helps Quest remote logs).
    if (triggerPressed) {
      var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (!this._xrSculptDiagAt || now - this._xrSculptDiagAt > 1200) {
        this._xrSculptDiagAt = now;
        var verts = 0;
        if (hit) {
          // Don't clobber Move/Drag topological picks with a fresh sphere query.
          var tIdx = this.getSculptManager().getToolIndex();
          var grabbing = tIdx === Enums.Tools.DRAG || tIdx === Enums.Tools.MOVE ||
            tIdx === Enums.Tools.TWIST || tIdx === Enums.Tools.LOCALSCALE ||
            tIdx === Enums.Tools.TRANSFORM;
          if ((!grabbing || !this._xrSculpting) && picking.getMesh() &&
              typeof picking.getMesh().getVertices === 'function' &&
              picking.getMesh().getVertices()) {
            picking.pickVerticesInSphere(picking.getLocalRadius2());
            verts = picking.getPickedVertices().length;
          } else if (grabbing && this._xrSculpting) {
            verts = -1;
          } else {
            verts = 0;
          }
          XRRemoteLog.see('MR', 'Right trigger sculpt: HIT — brushR=' + picking.getWorldRadius().toFixed(2) + (verts >= 0 ? (' verts~' + verts) : ' (grab)'), {
            hit: true,
            trigger: Math.round(triggerValue * 100) / 100,
            brush_world_r: Math.round(picking.getWorldRadius() * 100) / 100,
            verts: verts
          });
        } else if (triggerValue > 0.85) {
          // Only log confident misses (half-pulls while aiming are normal).
          XRRemoteLog.see('MR', 'Right trigger down but ray MISS — aim controller tip at clay', {
            hit: false,
            trigger: Math.round(triggerValue * 100) / 100
          });
        }
      }
    }

    if (!triggerPressed) {
      if (this._xrSculpting) {
        this._xrSculpting = false;
        this.getSculptManager().end();
      } else {
        // Multi-select clicks return false from startXR — still clear edge latch on release.
        var idleTool = this.getSculptManager().getCurrentTool();
        if (idleTool && idleTool.onXRTriggerRelease)
          idleTool.onXRTriggerRelease();
      }
      return;
    }

    var toolIdx = this.getSculptManager().getToolIndex();
    var keepGrab = toolIdx === Enums.Tools.DRAG ||
      toolIdx === Enums.Tools.MOVE ||
      toolIdx === Enums.Tools.TWIST ||
      toolIdx === Enums.Tools.LOCALSCALE ||
      toolIdx === Enums.Tools.TRANSFORM;

    // Brush needs a surface hit. Grab/Transform keep pulling even if the ray leaves the mesh.
    if (!hit && !keepGrab) return;
    if (!hit && keepGrab && !this._xrSculpting) {
      // Transform can start on gizmo even when ray misses clay
      if (toolIdx !== Enums.Tools.TRANSFORM) return;
    }

    if (!this._xrSculpting) {
      this._xrSculpting = this.getSculptManager().startXR();
      if (this._xrSculpting && !this._xrSculptLogged) {
        this._xrSculptLogged = true;
        console.info('[XRSetup] sculpt_ray_started', {
          hand: chosen.handedness || 'none',
          brush_world_r: picking.getWorldRadius(),
          expect: 'Trigger hold deforms mesh like desktop brush'
        });
        XRRemoteLog.see('MR', 'Sculpt ray HIT — holding right trigger should deform the clay (brush sized to mesh).', {
          hand: chosen.handedness || 'none',
          brush_world_r: Math.round(picking.getWorldRadius() * 100) / 100
        });
      }
    } else {
      // Brush-like tools need a fresh surface hit each frame.
      // Drag/Move keep their own grab state — re-picking the surface would fight them.
      if (!keepGrab) {
        picking.intersectionSceneRayMeshes(nearScene, farScene);
        if (picking.getMesh() && this.getSculptManager().getSymmetry())
          this.getPickingSymmetry().intersectionSceneRayMesh(picking.getMesh(), nearScene, farScene);
      }
      if (picking.getMesh() || keepGrab)
        this.getSculptManager().updateXR();
    }
  }

  /**
   * XR isolated path: no RTT contour/merge/fxaa — draws opaque meshes directly to the XR framebuffer.
   * See Web_XR_VR_RoadMap.MD (Phase 0.5 / performance notes).
   */
  drawXRFrame(frame, pose, session, refSpace) {
    var gl = this._gl;
    if (!gl) return;

    this._xrSessionMode = session.mode;
    // Passthrough / MR: never draw the desktop skybox or infinite grid — it replaces the camera feed and reads as a "VR room".
    // Use session.mode plus environmentBlendMode: some runtimes are easier to classify by blend than by mode alone.
    var blend = session.environmentBlendMode;
    var xrIsMR = session.mode === 'immersive-ar' ||
      blend === 'alpha-blend' ||
      blend === 'additive';
    this._xrPassthroughComposite = xrIsMR;

    var layer = session.renderState.baseLayer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);

    var cam = this._camera;
    var views = pose.views;
    var v;
    for (v = 0; v < views.length; ++v) {
      var view = views[v];
      var vp = layer.getViewport(view);
      // Without scissor, gl.clear wipes the *entire* XR framebuffer — one eye erases the other
      // (clay visible in one lens, missing/ghosted in the other).
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      gl.scissor(vp.x, vp.y, vp.width, vp.height);
      gl.enable(gl.SCISSOR_TEST);
      if (xrIsMR)
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
      else
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

      cam.applyXRView(view, this._xrStageMatrix);
      this.updateMeshesXR();

      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);

      this._drawOpaqueMeshesXR(xrIsMR);
      this._drawTransparentMeshesXR();
      // Transform gizmo (desktop Gizmo) — drawn in scene space like the clay.
      var sm = this.getSculptManager();
      if (sm.getToolIndex() === Enums.Tools.TRANSFORM) {
        var xf = sm.getCurrentTool();
        if (xf && xf.postRender) xf.postRender();
      } else {
        // Desktop-style brush ring + center/symmetry dots (hover or while sculpting).
        sm.getSelection().renderXR(this, !this._xrSculpting);
      }
      if (this._xrControllerModels && refSpace)
        this._xrControllerModels.renderEye(this, frame, refSpace, layer, view);

      // Controllers share this GL context via Three — restore a clean SculptGL state for the next eye.
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);
    }

    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  startXRControllers(session, refSpace) {
    var self = this;
    if (this._xrControllerModels) {
      this._xrControllerModels.start(session, refSpace);
      return;
    }
    import(/* webpackChunkName: "xr-three" */ 'xr/XRControllerModels')
      .then(function (mod) {
        if (!self.isXRSessionActive()) return;
        if (!self._xrControllerModels)
          self._xrControllerModels = new mod.default(self);
        self._xrControllerModels.start(session, refSpace);
      })
      .catch(function (e) {
        console.warn('XRControllerModels: failed to load xr-three chunk', e);
      });
  }

  stopXRControllers() {
    if (this._xrControllerModels)
      this._xrControllerModels.stop();
    // Always end an in-progress stroke — even if the sculpting flag was lost mid-glitch.
    try {
      this.getSculptManager().end();
    } catch (e) { /* ignore */ }
    this._xrSculpting = false;
    this._xrSculptLogged = false;
    this._xrTriggerLatched = false;
    this._xrRayNear = null;
    this._xrRayFar = null;
    this._xrRayUp = null;
    this._xrRayRight = null;
    this._xrRightStickX = 0;
    this._xrRightStickY = 0;
    this.getPicking()._mesh = null;
    this.getPickingSymmetry()._mesh = null;
    this.healXRBrushSettings(false);
  }

  /**
   * Keep brush usable across XR glitches / re-entry (never leave intensity at 0%).
   * @param {boolean} logWhenHealed
   */
  healXRBrushSettings(logWhenHealed) {
    var sm = this.getSculptManager && this.getSculptManager();
    if (!sm || !sm._tools) return;
    var healed = false;
    var i;
    for (i = 0; i < sm._tools.length; ++i) {
      var t = sm._tools[i];
      if (!t) continue;
      if (t._intensity !== undefined && t._intensity < 0.05) {
        t._intensity = 0.5;
        healed = true;
      }
      if (t._radius !== undefined && t._radius < 5) {
        t._radius = 50;
        healed = true;
      }
    }
    if (healed && logWhenHealed)
      XRRemoteLog.see('MR', 'Brush settings healed — intensity/radius restored to usable defaults');
  }

  /** Per-eye mesh matrices without optimizeNearFar (XR projection is authoritative). */
  updateMeshesXR() {
    var meshes = this._meshes;
    var i;
    var nb = meshes.length;
    var cam = this._camera;
    for (i = 0; i < nb; ++i)
      meshes[i].updateMatrices(cam);

    meshes.sort(Mesh.sortFunction);

    if (this._meshPreview) this._meshPreview.updateMatrices(cam);
    if (this._grid) this._grid.updateMatrices(cam);
  }

  /**
   * @param {boolean} xrIsMR - true when session.mode is immersive-ar (passthrough); skip studio background + floor grid.
   */
  _drawOpaqueMeshesXR(xrIsMR) {
    var gl = this._gl;
    var meshes = this._meshes;
    var i;
    var nb = meshes.length;

    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    if (!xrIsMR && this._showGrid) this._grid.render(this);

    for (i = 0; i < nb; ++i) {
      if (!meshes[i].isTransparent())
        meshes[i].render(this);
    }
    if (this._meshPreview && !this._meshPreview.isTransparent())
      this._meshPreview.render(this);

    // VR / non-passthrough: full-screen env matches desktop PBR. MR: skip — it would occlude the real room.
    if (!xrIsMR)
      this._background.render();
  }

  _drawTransparentMeshesXR() {
    var gl = this._gl;
    var meshes = this._meshes;
    var i;
    var nb = meshes.length;

    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.enable(gl.CULL_FACE);

    for (i = 0; i < nb; ++i) {
      if (!meshes[i].isTransparent()) continue;
      gl.cullFace(gl.FRONT);
      meshes[i].render(this);
      gl.cullFace(gl.BACK);
      meshes[i].render(this);
    }
    if (this._meshPreview && this._meshPreview.isTransparent())
      this._meshPreview.render(this);

    gl.disable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  /** Pre compute matrices and sort meshes */
  updateMatricesAndSort() {
    var meshes = this._meshes;
    var cam = this._camera;
    if (meshes.length > 0) {
      cam.optimizeNearFar(this.computeBoundingBoxScene());
    }

    for (var i = 0, nb = meshes.length; i < nb; ++i) {
      meshes[i].updateMatrices(cam);
    }

    meshes.sort(Mesh.sortFunction);

    if (this._meshPreview) this._meshPreview.updateMatrices(cam);
    if (this._grid) this._grid.updateMatrices(cam);
  }

  initWebGL() {
    var attributes = {
      antialias: false,
      stencil: true,
      xrCompatible: true
    };

    var canvas = document.getElementById('canvas');
    var gl = null;
    var attempts = [
      { type: 'webgl2', attrs: attributes },
      { type: 'webgl', attrs: attributes },
      { type: 'experimental-webgl', attrs: attributes },
      { type: 'webgl2', attrs: { antialias: false, stencil: true } },
      { type: 'webgl', attrs: { antialias: false, stencil: true } },
      { type: 'experimental-webgl', attrs: { antialias: false, stencil: true } }
    ];
    var i;
    for (i = 0; i < attempts.length; ++i) {
      try {
        gl = canvas.getContext(attempts[i].type, attempts[i].attrs);
      } catch (e) {
        gl = null;
      }
      if (gl) break;
    }
    this._gl = gl;
    if (!gl) {
      window.alert('Could not initialise WebGL. No WebGL, no SculptGL. Sorry.');
      return;
    }

    WebGLCaps.initWebGLExtensions(gl);
    if (!WebGLCaps.getWebGLExtension('OES_element_index_uint'))
      RenderData.ONLY_DRAW_ARRAYS = true;

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    gl.disable(gl.CULL_FACE);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);

    gl.disable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.disable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  /** Load textures (preload) */
  loadTextures() {
    var self = this;
    var gl = this._gl;
    var ShaderMatcap = ShaderLib[Enums.Shader.MATCAP];

    var loadTex = function (path, idMaterial) {
      var mat = new Image();
      mat.src = path;

      mat.onload = function () {
        ShaderMatcap.createTexture(gl, mat, idMaterial);
        self.render();
      };
    };

    for (var i = 0, mats = ShaderMatcap.matcaps, l = mats.length; i < l; ++i)
      loadTex(mats[i].path, i);

    this.initAlphaTextures();
  }

  initAlphaTextures() {
    var alphas = Picking.INIT_ALPHAS_PATHS;
    var names = Picking.INIT_ALPHAS_NAMES;
    for (var i = 0, nbA = alphas.length; i < nbA; ++i) {
      var am = new Image();
      am.src = 'resources/alpha/' + alphas[i];
      am.onload = this.onLoadAlphaImage.bind(this, am, names[i]);
    }
  }

  /** Called when the window is resized */
  onCanvasResize() {
    var viewport = this._viewport;
    var newWidth = viewport.clientWidth * this._pixelRatio;
    var newHeight = viewport.clientHeight * this._pixelRatio;

    this._canvasOffsetLeft = viewport.offsetLeft;
    this._canvasOffsetTop = viewport.offsetTop;
    this._canvasWidth = newWidth;
    this._canvasHeight = newHeight;

    this._canvas.width = newWidth;
    this._canvas.height = newHeight;

    this._gl.viewport(0, 0, newWidth, newHeight);
    this._camera.onResize(newWidth, newHeight);
    this._background.onResize(newWidth, newHeight);

    this._rttContour.onResize(newWidth, newHeight);
    this._rttMerge.onResize(newWidth, newHeight);
    this._rttOpaque.onResize(newWidth, newHeight);
    this._rttTransparent.onResize(newWidth, newHeight);

    this.render();
  }

  computeRadiusFromBoundingBox(box) {
    var dx = box[3] - box[0];
    var dy = box[4] - box[1];
    var dz = box[5] - box[2];
    return 0.5 * Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  computeBoundingBoxMeshes(meshes) {
    var bound = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (var i = 0, l = meshes.length; i < l; ++i) {
      if (!meshes[i].isVisible()) continue;
      var bi = meshes[i].computeWorldBound();
      if (bi[0] < bound[0]) bound[0] = bi[0];
      if (bi[1] < bound[1]) bound[1] = bi[1];
      if (bi[2] < bound[2]) bound[2] = bi[2];
      if (bi[3] > bound[3]) bound[3] = bi[3];
      if (bi[4] > bound[4]) bound[4] = bi[4];
      if (bi[5] > bound[5]) bound[5] = bi[5];
    }
    return bound;
  }

  computeBoundingBoxScene() {
    var scene = this._meshes.slice();
    scene.push(this._grid);
    this._sculptManager.addSculptToScene(scene);
    return this.computeBoundingBoxMeshes(scene);
  }

  /**
   * Fit imported meshes into the sculpt unit frame (same SCALE as normalizeSize
   * on primitives). Uniform scale + center only — preserves XYZ / Y-up axes.
   */
  normalizeAndCenterMeshes(meshes) {
    var box = this.computeBoundingBoxMeshes(meshes);
    // Diagonal of AABB == 2 * localRadius used by Mesh.normalizeSize.
    var scale = Utils.SCALE / vec3.dist([box[0], box[1], box[2]], [box[3], box[4], box[5]]);

    var mCen = mat4.create();
    mat4.scale(mCen, mCen, [scale, scale, scale]);
    mat4.translate(mCen, mCen, [-(box[0] + box[3]) * 0.5, -(box[1] + box[4]) * 0.5, -(box[2] + box[5]) * 0.5]);

    for (var i = 0, l = meshes.length; i < l; ++i) {
      var mat = meshes[i].getMatrix();
      mat4.mul(mat, mCen, mat);
    }
  }

  addSphere() {
    // make a cube and subdivide it
    var mesh = new Multimesh(Primitives.createCube(this._gl));
    mesh.normalizeSize();
    this.subdivideClamp(mesh);
    return this.addNewMesh(mesh);
  }

  addCube() {
    var mesh = new Multimesh(Primitives.createCube(this._gl));
    mesh.normalizeSize();
    mat4.scale(mesh.getMatrix(), mesh.getMatrix(), [0.7, 0.7, 0.7]);
    this.subdivideClamp(mesh, true);
    return this.addNewMesh(mesh);
  }

  addCylinder() {
    var mesh = new Multimesh(Primitives.createCylinder(this._gl));
    mesh.normalizeSize();
    mat4.scale(mesh.getMatrix(), mesh.getMatrix(), [0.7, 0.7, 0.7]);
    this.subdivideClamp(mesh);
    return this.addNewMesh(mesh);
  }

  addTorus(preview) {
    var mesh = new Multimesh(Primitives.createTorus(this._gl, this._torusLength, this._torusWidth, this._torusRadius, this._torusRadial, this._torusTubular));
    if (preview) {
      mesh.setShowWireframe(true);
      var scale = 0.3 * Utils.SCALE;
      mat4.scale(mesh.getMatrix(), mesh.getMatrix(), [scale, scale, scale]);
      this._meshPreview = mesh;
      return;
    }
    mesh.normalizeSize();
    this.subdivideClamp(mesh);
    this.addNewMesh(mesh);
  }

  subdivideClamp(mesh, linear) {
    Subdivision.LINEAR = !!linear;
    while (mesh.getNbFaces() < 50000)
      mesh.addLevel();
    // keep at max 4 multires
    mesh._meshes.splice(0, Math.min(mesh._meshes.length - 4, 4));
    mesh._sel = mesh._meshes.length - 1;
    Subdivision.LINEAR = false;
  }

  addNewMesh(mesh) {
    this._meshes.push(mesh);
    this._stateManager.pushStateAdd(mesh);
    this.setMesh(mesh);
    return mesh;
  }

  loadScene(fileData, fileType) {
    var self = this;
    if (fileType === 'glb' || fileType === 'gltf') {
      return Import.importGLTF(fileData, this._gl).then(function (newMeshes) {
        return self._ingestImportedMeshes(newMeshes);
      }).catch(function (err) {
        XRRemoteLog.see('MR', 'GLB/glTF import failed', {
          error: String(err && err.message || err)
        });
        console.warn('GLB/glTF import failed', err);
        return null;
      });
    }

    var newMeshes;
    if (fileType === 'obj') newMeshes = Import.importOBJ(fileData, this._gl);
    else if (fileType === 'sgl') newMeshes = Import.importSGL(fileData, this._gl, this);
    else if (fileType === 'stl') newMeshes = Import.importSTL(fileData, this._gl);
    else if (fileType === 'ply') newMeshes = Import.importPLY(fileData, this._gl);
    else return null;

    return this._ingestImportedMeshes(newMeshes);
  }

  /** Shared post-import path for OBJ/PLY/STL/SGL/GLB. */
  _ingestImportedMeshes(newMeshes) {
    var nbNewMeshes = newMeshes && newMeshes.length;
    if (!nbNewMeshes) {
      return null;
    }

    var meshes = this._meshes;
    for (var i = 0; i < nbNewMeshes; ++i) {
      var mesh = newMeshes[i] = new Multimesh(newMeshes[i]);

      if (!this._vertexSRGB && mesh.getColors()) {
        Utils.convertArrayVec3toSRGB(mesh.getColors());
      }

      mesh.init();
      mesh.initRender();
      meshes.push(mesh);
    }

    if (this._autoMatrix) {
      this.normalizeAndCenterMeshes(newMeshes);
    }

    this._stateManager.pushStateAdd(newMeshes);
    this.setMesh(meshes[meshes.length - 1]);
    this.resetCameraMeshes(newMeshes);
    if (this.isXRSessionActive && this.isXRSessionActive()) {
      this.fitXRStageToScene();
      XRRemoteLog.see('MR', 'Imported mesh(es) into scene', {
        meshes: newMeshes.length,
        total: meshes.length
      });
    }
    this.render();
    return newMeshes;
  }

  clearScene() {
    this.getStateManager().reset();
    this.getMeshes().length = 0;
    this.getCamera().resetView();
    this.setMesh(null);
    this._action = Enums.Action.NOTHING;
  }

  deleteCurrentSelection() {
    if (!this._mesh)
      return;

    this.removeMeshes(this._selectMeshes);
    this._stateManager.pushStateRemove(this._selectMeshes.slice());
    this._selectMeshes.length = 0;
    this.setMesh(null);
  }

  removeMeshes(rm) {
    var meshes = this._meshes;
    for (var i = 0; i < rm.length; ++i)
      meshes.splice(this.getIndexMesh(rm[i]), 1);
  }

  getIndexMesh(mesh, select) {
    var meshes = select ? this._selectMeshes : this._meshes;
    var id = mesh.getID();
    for (var i = 0, nbMeshes = meshes.length; i < nbMeshes; ++i) {
      var testMesh = meshes[i];
      if (testMesh === mesh || testMesh.getID() === id)
        return i;
    }
    return -1;
  }

  getIndexSelectMesh(mesh) {
    return this.getIndexMesh(mesh, true);
  }

  /** Replace a mesh in the scene */
  replaceMesh(mesh, newMesh) {
    var index = this.getIndexMesh(mesh);
    if (index >= 0) this._meshes[index] = newMesh;
    if (this._mesh === mesh) this.setMesh(newMesh);
  }

  duplicateSelection() {
    var meshes = this._selectMeshes.slice();
    var mesh = null;
    for (var i = 0; i < meshes.length; ++i) {
      mesh = meshes[i];
      var copy = new MeshStatic(mesh.getGL());
      copy.copyData(mesh);

      this.addNewMesh(copy);
    }

    this.setMesh(mesh);
  }

  onLoadAlphaImage(img, name, tool) {
    var can = document.createElement('canvas');
    can.width = img.width;
    can.height = img.height;

    var ctx = can.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var u8rgba = ctx.getImageData(0, 0, img.width, img.height).data;
    var u8lum = u8rgba.subarray(0, u8rgba.length / 4);
    for (var i = 0, j = 0, n = u8lum.length; i < n; ++i, j += 4)
      u8lum[i] = Math.round((u8rgba[j] + u8rgba[j + 1] + u8rgba[j + 2]) / 3);

    name = Picking.addAlpha(u8lum, img.width, img.height, name)._name;

    var entry = {};
    entry[name] = name;
    this.getGui().addAlphaOptions(entry);
    if (tool && tool._ctrlAlpha)
      tool._ctrlAlpha.setValue(name);
  }
}

export default Scene;
