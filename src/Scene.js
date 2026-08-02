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
import LocalRecord from 'xr/LocalRecord';
import Tablet from 'misc/Tablet';
import ImportURL from 'files/ImportURL';
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
    /** @type {{x:number,y:number,z:number,yaw:number}|null} headset pose used to seat Workspace ahead of the user */
    this._xrViewerAnchor = null;
    /** Latest viewer pose each XR frame (for SPACE recenter). */
    this._xrLastViewer = null;
    /** True until first viewer pose seats the stage in front of the headset. */
    this._xrPendingViewerAnchor = false;
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
    // Local Snapshot: last headset pose used for PNG/video of the virtual view.
    this._xrSnapView = mat4.create(); // clay: inv(viewer) * stage
    this._xrSnapViewHud = mat4.create(); // controllers/dock: inv(viewer) only
    this._xrSnapProj = mat4.create();
    this._xrSnapTmp = mat4.create();
    this._xrSnapReady = false;
    this._xrSnapIsMR = false;
    // XR still: queued until end of frame after aim delay (dock click faces the menu, not the clay).
    this._xrSnapPending = null; // { resolve, reject, after, hideDock }
    this._localSnapshotTarget = null; // { fb, tex, depth, w, h, canvas2d, ctx }
    this._localSnapshotPass = false; // shaders: direct sRGB out (skip RGBM RTT encode)
    this._localSnapshotBusy = false; // block concurrent desktop applyRender during FBO capture
    this._localRecFps = 24;
    this._localRecQuality = 'balanced';
    this._localRec = null; // active recording session
    this._localRecDesktopRaf = 0;
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
    if (modelURL) {
      this.addModelURL(modelURL).catch(function (err) {
        console.warn('?modelurl= import failed', err && err.message ? err.message : err);
      });
    } else {
      this.addSphere();
    }

    this._webXR = new WebXRSession(this);
    this._webXR.initUI();
  }

  /**
   * Fetch a mesh from a remote URL (HTTPS + CORS).
   * @param {string} url
   * @param {{ onProgress?: function, silent?: boolean }} [opts]
   * @returns {Promise<*>} resolves with loadScene result (or null)
   */
  addModelURL(url, opts) {
    opts = opts || {};
    var check = ImportURL.validateImportURL(url);
    if (!check.ok) {
      console.warn('addModelURL:', check.error);
      XRRemoteLog.see('MR', 'Import URL rejected', { error: check.error, url: String(url).slice(0, 120) });
      return Promise.reject(new Error(check.error));
    }

    var fileType = check.fileType;
    var safeUrl = check.url;
    XRRemoteLog.see('MR', 'Import URL fetching…', { type: fileType, url: safeUrl.slice(0, 120) });

    var self = this;
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var settled = false;
      var timer = window.setTimeout(function () {
        if (settled) return;
        settled = true;
        try { xhr.abort(); } catch (e) { /* ignore */ }
        var err = new Error('Import timed out after ' + (ImportURL.FETCH_TIMEOUT_MS / 1000) + 's — check the URL / network.');
        XRRemoteLog.see('MR', 'Import URL timeout', { url: safeUrl.slice(0, 120) });
        reject(err);
      }, ImportURL.FETCH_TIMEOUT_MS);

      function fail(msg, detail) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        console.warn('addModelURL', msg, detail || '');
        XRRemoteLog.see('MR', 'Import URL failed — ' + msg, detail || { url: safeUrl.slice(0, 120) });
        reject(new Error(msg));
      }

      function ok(result) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        XRRemoteLog.see('MR', 'Import URL loaded', { type: fileType });
        resolve(result);
      }

      xhr.open('GET', safeUrl, true);
      xhr.responseType = (fileType === 'obj' || fileType === 'gltf') ? 'text' : 'arraybuffer';

      xhr.onprogress = function (ev) {
        if (ev.lengthComputable && ev.total > ImportURL.MAX_BYTES) {
          fail('File too large (max ~80 MB).', { total: ev.total });
          try { xhr.abort(); } catch (e) { /* ignore */ }
          return;
        }
        if (opts.onProgress && ev.lengthComputable)
          opts.onProgress(ev.loaded, ev.total);
      };

      xhr.onload = function () {
        if (settled) return;
        if (!(xhr.status === 200 || xhr.status === 0)) {
          fail('HTTP ' + xhr.status + ' — verify the URL is public and correct.', { status: xhr.status });
          return;
        }
        var lenHeader = xhr.getResponseHeader('Content-Length');
        if (lenHeader && parseInt(lenHeader, 10) > ImportURL.MAX_BYTES) {
          fail('File too large (max ~80 MB).');
          return;
        }
        var body = xhr.response;
        if (body && body.byteLength && body.byteLength > ImportURL.MAX_BYTES) {
          fail('File too large (max ~80 MB).');
          return;
        }
        try {
          var result = self.loadScene(body, fileType);
          if (result && typeof result.then === 'function') {
            result.then(ok).catch(function (err) {
              fail((err && err.message) || 'Failed to parse mesh from URL.', {
                type: fileType,
                err: err && err.message ? err.message : String(err)
              });
            });
          } else {
            ok(result);
          }
        } catch (err) {
          fail((err && err.message) || 'Failed to parse mesh from URL.', {
            type: fileType,
            err: err && err.message ? err.message : String(err)
          });
        }
      };

      xhr.onerror = function () {
        fail('Network/CORS error — the host must allow this page (HTTPS + Access-Control-Allow-Origin).', {
          url: safeUrl.slice(0, 120)
        });
      };

      xhr.send(null);
    });
  }

  /**
   * Desktop / XR prompt → validate → fetch. Returns a Promise (may reject).
   * @returns {Promise<*>}
   */
  promptImportURL() {
    var sample = 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/Duck/glTF-Binary/Duck.glb';
    var url = window.prompt(ImportURL.promptText(), sample);
    if (url == null) return Promise.reject(new Error('cancelled'));
    url = String(url).trim();
    if (!url) return Promise.reject(new Error('cancelled'));

    var check = ImportURL.validateImportURL(url);
    if (!check.ok) {
      window.alert('Import URL blocked\n\n' + check.error + '\n\n' + ImportURL.cautionText());
      return Promise.reject(new Error(check.error));
    }

    var self = this;
    return this.addModelURL(check.url).catch(function (err) {
      var msg = (err && err.message) ? err.message : String(err);
      window.alert('Import URL failed\n\n' + msg + '\n\n' + ImportURL.cautionText());
      return Promise.reject(err);
    });
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
      this._xrPendingViewerAnchor = false;
      this._xrViewerAnchor = null;
      this._xrLastViewer = null;
      if (this.isLocalRecording()) this._startLocalRecordDesktopLoop();
    } else {
      this._stopLocalRecordDesktopLoop();
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
   * Yaw (Y-up) from a WebXR orientation quaternion — facing direction on the floor plane.
   * @param {{x:number,y:number,z:number,w:number}} o
   * @returns {number}
   */
  _yawFromXROrientation(o) {
    if (!o) return 0;
    var qx = o.x || 0;
    var qy = o.y || 0;
    var qz = o.z || 0;
    var qw = o.w == null ? 1 : o.w;
    // Rotate local forward (0, 0, -1) into world
    var vx = 0;
    var vy = 0;
    var vz = -1;
    var tx = 2 * (qy * vz - qz * vy);
    var ty = 2 * (qz * vx - qx * vz);
    var tz = 2 * (qx * vy - qy * vx);
    var fx = vx + qw * tx + (qy * tz - qz * ty);
    var fz = vz + qw * tz + (qx * ty - qy * tx);
    return Math.atan2(fx, -fz);
  }

  /**
   * Track headset pose each XR frame; seat Workspace on first pose (and when recenter is pending).
   * Guardian / boundary size varies — place relative to the headset, not session origin alone.
   * @param {XRViewerPose|null} pose
   */
  updateXRViewerFromPose(pose) {
    if (!pose || !pose.transform) return;
    var p = pose.transform.position;
    var o = pose.transform.orientation;
    if (!p) return;
    var yaw = this._yawFromXROrientation(o);
    this._xrLastViewer = { x: p.x, y: p.y, z: p.z, yaw: yaw };
    if (!this._xrPendingViewerAnchor) return;
    this._xrPendingViewerAnchor = false;
    this._xrViewerAnchor = {
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: yaw
    };
    this.fitXRStageToScene();
    XRRemoteLog.see('MR', 'Workspace seated in front of headset', {
      yaw_deg: Math.round((yaw * 180) / Math.PI),
      eye_y_m: Math.round(p.y * 100) / 100,
      note: 'independent of guardian size — Meta recenter not required'
    });
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
    var ax = 0.0;
    var ay = 1.25;
    var az = 0.0;
    var faceYaw = 0.0;
    var anchor = this._xrViewerAnchor;
    if (anchor) {
      ax = anchor.x || 0;
      az = anchor.z || 0;
      faceYaw = anchor.yaw || 0;
      // Sculpt height from eye: slightly below headset, clamped for standing comfort.
      if (anchor.y != null)
        ay = Math.min(1.55, Math.max(1.05, anchor.y - 0.35));
    }
    // Orbit rotates about selection COM (f.center*). View offset keeps the room stable when that
    // COM is updated after Transform (otherwise T(-C) changes → snap).
    // Seat: headset XZ + facing yaw, then push clay forward (−Z) by distance.
    mat4.identity(this._xrStageMatrix);
    mat4.translate(this._xrStageMatrix, this._xrStageMatrix, [ax, ay, az]);
    mat4.rotateY(this._xrStageMatrix, this._xrStageMatrix, faceYaw);
    mat4.translate(this._xrStageMatrix, this._xrStageMatrix, [0.0, 0.0, -f.distance]);
    mat4.translate(this._xrStageMatrix, this._xrStageMatrix, off);
    mat4.rotateY(this._xrStageMatrix, this._xrStageMatrix, this._xrOrbitYaw || 0);
    mat4.rotateX(this._xrStageMatrix, this._xrStageMatrix, this._xrOrbitPitch || 0);
    mat4.scale(this._xrStageMatrix, this._xrStageMatrix, [f.scale, f.scale, f.scale]);
    mat4.translate(this._xrStageMatrix, this._xrStageMatrix, [-f.centerX, -f.centerY, -f.centerZ]);

    var scaledR = f.scaledRadius != null ? f.scaledRadius : (f.radius * f.scale);
    this._xrStageDesc = {
      height_m: Math.round(ay * 100) / 100,
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
      orbit_pitch: Math.round((this._xrOrbitPitch || 0) * 100) / 100,
      viewer_anchored: !!anchor,
      face_yaw_deg: Math.round((faceYaw * 180) / Math.PI)
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

  /**
   * Reset Workspace size/orbit and re-seat clay in front of the current headset pose.
   * Prefer last viewer pose from the XR frame loop (works across guardian sizes).
   */
  recenterXRStage() {
    this._xrOrbitYaw = 0.0;
    this._xrOrbitPitch = 0.0;
    this._xrDistanceOffset = 0.0;
    this._xrEntryScale = 1.0;
    this._xrOrbitViewOffset = [0.0, 0.0, 0.0];
    if (this._xrLastViewer) {
      this._xrViewerAnchor = {
        x: this._xrLastViewer.x,
        y: this._xrLastViewer.y,
        z: this._xrLastViewer.z,
        yaw: this._xrLastViewer.yaw
      };
      this._xrPendingViewerAnchor = false;
      this.fitXRStageToScene();
      return;
    }
    this._xrPendingViewerAnchor = true;
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

    // Selection COM in ref space after viewer-anchored stage (see _rebuildXRStageMatrix).
    var f = this._xrStageFit;
    if (!f) return;
    var off = this._xrOrbitViewOffset;
    var ax = 0.0;
    var ay = 1.25;
    var az = 0.0;
    var faceYaw = 0.0;
    var anchor = this._xrViewerAnchor;
    if (anchor) {
      ax = anchor.x || 0;
      az = anchor.z || 0;
      faceYaw = anchor.yaw || 0;
      if (anchor.y != null)
        ay = Math.min(1.55, Math.max(1.05, anchor.y - 0.35));
    }
    var lx = off[0];
    var ly = off[1];
    var lz = off[2] - f.distance;
    var cosY = Math.cos(faceYaw);
    var sinY = Math.sin(faceYaw);
    var comX = ax + lx * cosY + lz * sinY;
    var comY = ay + ly;
    var comZ = az - lx * sinY + lz * cosY;

    var hx = viewerPos ? viewerPos.x : ax;
    var hy = viewerPos ? viewerPos.y : (ay + 0.35);
    var hz = viewerPos ? viewerPos.z : az;

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
    // Don't draw the desktop path while a local snapshot/record FBO pass is mid-flight
    // (shared GL context — would hitch the wrong framebuffer / viewport).
    if (this._localSnapshotBusy) {
      this.render();
      return;
    }

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

    // Desktop Local Record: push the just-presented canvas frame into MediaRecorder.
    this._notifyLocalRecordDisplayFrame();
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
   * @param {'obj'|'obj-maps'|'glb'|'ply'|'stl'} fmt
   * @returns {{ name: string, fmt: string, bytes: number }|Promise<{name:string,fmt:string,bytes:number}>}
   */
  exportXRMesh(fmt) {
    this._endXRSculptStroke();
    var meshes = this.getMeshes();
    if (!meshes || !meshes.length)
      throw new Error('No meshes to export');
    var f = (fmt || 'obj').toLowerCase();
    var self = this;

    if (f === 'obj-maps' || f === 'objmaps' || f === 'obj+maps') {
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

    if (f === 'glb' || f === 'gltf') {
      var glbBase = XRProjectStore.stampName('glb').replace(/\.glb$/i, '');
      return Export.exportGLB(this, meshes, {
        baseName: glbBase,
        texSize: 1024,
        binary: true,
        save: true
      }).then(function (out) {
        XRRemoteLog.see('MR', 'Exported .glb (browser download)', {
          name: out.name,
          bytes: out.bytes,
          baked: out.baked,
          skipped: out.skipped,
          payload: Export.formatInfo.detail('glb')
        });
        return { name: out.name, fmt: 'glb', bytes: out.bytes };
      }).catch(function (err) {
        if (self.onCanvasResize) self.onCanvasResize();
        XRRemoteLog.see('MR', 'GLB export failed', {
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
   * Add a primitive like Desktop Topology (sphere / cube / cylinder / torus).
   * Places near the current selection at a similar size — does NOT re-fit Workspace
   * (re-fit on Clear / Recenter only; otherwise ADD balloons the bbox and shrinks the room).
   * @param {'sphere'|'cube'|'cylinder'|'torus'} kind
   */
  addXRShape(kind) {
    this._endXRSculptStroke();
    var anchor = this.getMesh();
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
    if (mesh && anchor && anchor !== mesh)
      this._placeXRShapeNearAnchor(mesh, anchor);
    // Keep Workspace scale/distance; only nudge orbit pivot if we already have a stage fit.
    if (this._xrStageFit)
      this.syncXROrbitPivotToSelection(true);
    this.render();
    XRRemoteLog.see('MR', 'Added shape → ' + k, {
      meshes: this.getMeshes().length,
      placed_near_selection: !!(mesh && anchor && anchor !== mesh),
      workspace_refit: false
    });
    return mesh;
  }

  /**
   * Translate / scale a freshly added primitive next to an existing mesh in model space.
   * Matching size keeps ADD from looking like a tiny speck beside a huge sculpt COM.
   */
  _placeXRShapeNearAnchor(mesh, anchor) {
    if (!mesh || !anchor || mesh === anchor) return;
    var aBox = this.computeBoundingBoxMeshes([anchor]);
    var mBox = this.computeBoundingBoxMeshes([mesh]);
    if (!isFinite(aBox[0]) || !isFinite(mBox[0])) return;

    var aCx = (aBox[0] + aBox[3]) * 0.5;
    var aCy = (aBox[1] + aBox[4]) * 0.5;
    var aCz = (aBox[2] + aBox[5]) * 0.5;
    var aR = Math.max(0.05, this.computeRadiusFromBoundingBox(aBox));
    var mR = Math.max(0.05, this.computeRadiusFromBoundingBox(mBox));

    var mat = mesh.getMatrix();
    // Match roughly the anchor's world size (primitives start at normalizeSize unit).
    var s = aR / mR;
    s = Math.min(4.0, Math.max(0.15, s));
    if (Math.abs(s - 1.0) > 0.02)
      mat4.scale(mat, mat, [s, s, s]);

    mBox = this.computeBoundingBoxMeshes([mesh]);
    if (!isFinite(mBox[0])) return;
    var mCx = (mBox[0] + mBox[3]) * 0.5;
    var mCy = (mBox[1] + mBox[4]) * 0.5;
    var mCz = (mBox[2] + mBox[5]) * 0.5;

    // Offset along +X so the new piece sits beside the sculpt, not inside it.
    // Left-multiply translation so it is world-space (not scaled local).
    var gap = aR * 1.25;
    var tMat = mat4.create();
    mat4.fromTranslation(tMat, [
      aCx + gap - mCx,
      aCy - mCy,
      aCz - mCz
    ]);
    mat4.mul(mat, tMat, mat);
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
      Tablet.clearXRAnalog();
      this._applyXRSmoothHold(false);
      if (this._xrSculpting) {
        this._xrSculpting = false;
        this.getSculptManager().end();
      }
      this.getPicking()._mesh = null;
      this.getPickingSymmetry()._mesh = null;
      return;
    }

    // Analog trigger → paint/soften intensity via Tablet (keeps latch; half-pull does not end stroke).
    if (triggerPressed) {
      Tablet.xrAnalog = true;
      Tablet.pressure = Math.max(0, Math.min(1, triggerValue));
    } else {
      Tablet.clearXRAnalog();
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
    // Never run pickVerticesInSphere here while already sculpting — logging must not pay a full pick.
    if (triggerPressed) {
      var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (!this._xrSculptDiagAt || now - this._xrSculptDiagAt > 1200) {
        this._xrSculptDiagAt = now;
        var verts = 0;
        if (hit) {
          var tIdx = this.getSculptManager().getToolIndex();
          var grabbing = tIdx === Enums.Tools.DRAG || tIdx === Enums.Tools.MOVE ||
            tIdx === Enums.Tools.TWIST || tIdx === Enums.Tools.LOCALSCALE ||
            tIdx === Enums.Tools.TRANSFORM;
          if (this._xrSculpting) {
            // Reuse last pick count if present; do not re-pick for diag.
            var picked = picking.getPickedVertices && picking.getPickedVertices();
            verts = grabbing ? -1 : (picked && picked.length ? picked.length : -1);
          } else if (!grabbing && picking.getMesh() &&
              typeof picking.getMesh().getVertices === 'function' &&
              picking.getMesh().getVertices()) {
            picking.pickVerticesInSphere(picking.getLocalRadius2());
            verts = picking.getPickedVertices().length;
          } else {
            verts = grabbing ? -1 : 0;
          }
          XRRemoteLog.see('MR', 'Right trigger sculpt: HIT — brushR=' + picking.getWorldRadius().toFixed(2) + (verts >= 0 ? (' verts~' + verts) : ' (sculpting/grab)'), {
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
      Tablet.clearXRAnalog();
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
      // Lock stamp freezes the center — re-picking would fight updateSculptLockXR.
      var curTool = this.getSculptManager().getCurrentTool();
      var lockStamp = !!(curTool && curTool._lockPosition);
      if (!keepGrab && !lockStamp) {
        picking.intersectionSceneRayMeshes(nearScene, farScene);
        if (picking.getMesh() && this.getSculptManager().getSymmetry())
          this.getPickingSymmetry().intersectionSceneRayMesh(picking.getMesh(), nearScene, farScene);
      }
      if (picking.getMesh() || keepGrab || lockStamp)
        this.getSculptManager().updateXR();
    }
    // One GPU upload per XR frame (stamps only dirty-flag during makeStrokeXR / grab tools).
    this.getSculptManager().flushXRMeshBuffers();
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

    // Local Snapshot / Record: Cast-like mono = viewer (head) pose, not left-eye IPD offset.
    // Flat WebM is not stereo VR video — headset playback will not "undistort" it.
    if (pose && pose.transform && pose.transform.matrix) {
      mat4.invert(this._xrSnapViewHud, pose.transform.matrix);
      mat4.copy(this._xrSnapView, this._xrSnapViewHud);
      if (this._xrStageMatrix) {
        mat4.mul(this._xrSnapTmp, this._xrSnapView, this._xrStageMatrix);
        mat4.copy(this._xrSnapView, this._xrSnapTmp);
      }
      if (views && views[0] && views[0].projectionMatrix)
        mat4.copy(this._xrSnapProj, views[0].projectionMatrix);
      this._xrSnapReady = true;
      this._xrSnapIsMR = xrIsMR;
    }

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
    // Stills after pose update (same timing as record frames) — never mid dock-click / mid-eye.
    this._tickPendingXRSnapshot();
    this._tickLocalRecording();
  }

  /**
   * Local Snapshot — PNG of the virtual sculpt view (not Quest Cast / not passthrough).
   * Desktop: copy the live WebGL canvas (same pixels the camera shows) — no offscreen FBO.
   * XR: short aim delay, then mono redraw from current headset pose (dock click always faces the menu).
   * @returns {Promise<{name:string, bytes:number}>}
   */
  captureLocalSnapshot() {
    if (this._xrSessionActive)
      return this._queueXRLocalSnapshot();
    return this._encodeLocalSnapshotCanvas(this._captureDesktopCanvasTo2D());
  }

  /**
   * Flat PNG of the XR Sculpt Dock menu for how-tos / GitHub (desktop docs helper).
   * @param {{tab?:string, tool?:string, keepToast?:boolean, full?:boolean, fileTag?:string}} [opts]
   * @returns {Promise<{name:string, bytes:number, w:number, h:number, tab:string}>}
   */
  exportXRDockUI(opts) {
    opts = opts || {};
    if (opts.full === undefined) opts.full = true;
    var cm = this._xrControllerModels;
    var dock = cm && cm._sculptDock;
    if (dock && dock.exportUIPng)
      return dock.exportUIPng(opts);

    var self = this;
    return import(/* webpackChunkName: "xr-dock" */ 'xr/XRSculptDock')
      .then(function (mod) {
        var d = new mod.default(self);
        d.syncFromDesktop();
        return d.exportUIPng(opts).finally(function () {
          try { d.dispose(); } catch (e) { /* ignore */ }
        });
      });
  }

  /**
   * How-to pack: every WebXR dock tab at full height (OPTS includes hidden rows).
   * Also dumps OPTS for brush + paint tool contexts (paint adds extra rows).
   * Docs helper — regenerate when the XR menu settles; not an end-user headset feature.
   * @returns {Promise<Array<{name:string, tab:string, tag?:string}>>}
   */
  exportXRDockUIAllTabs() {
    var self = this;
    var jobs = [
      { tab: 'form', tool: 'brush', fileTag: 'form' },
      { tab: 'paint', tool: 'paint', fileTag: 'paint' },
      { tab: 'alpha', tool: 'brush', fileTag: 'alpha' },
      { tab: 'opts', tool: 'brush', fileTag: 'opts-brush' },
      { tab: 'opts', tool: 'paint', fileTag: 'opts-paint' },
      { tab: 'workspace', fileTag: 'workspace' }
    ];
    var out = [];
    var i = 0;
    function next() {
      if (i >= jobs.length)
        return Promise.resolve(out);
      var job = jobs[i++];
      return self.exportXRDockUI({
        tab: job.tab,
        tool: job.tool,
        fileTag: job.fileTag,
        keepToast: false,
        full: true
      }).then(function (rec) {
        out.push(rec);
        return next();
      });
    }
    return next();
  }

  /**
   * Desktop how-to pack: sidebar folders + key topbar menus (DOM screenshots).
   * Pair with exportXRDockUIAllTabs for WebXR menu docs. WIP — re-run when UI changes.
   * @returns {Promise<Array<{name:string, bytes:number, tag:string}>>}
   */
  exportDesktopUIAllPanels() {
    var self = this;
    return import(/* webpackChunkName: "desktop-howto" */ 'gui/exportDesktopHowTo')
      .then(function (mod) {
        return mod.exportDesktopHowToPack(self);
      });
  }

  /** Aim window so the artist can look at the clay after selecting LOCAL SNAPSHOT on the wrist dock. */
  getXRSnapshotAimMs() {
    return 1600;
  }

  /**
   * Queue an XR still for the end of a later frame (fresh head pose).
   * @returns {Promise<{name:string, bytes:number}>}
   */
  _queueXRLocalSnapshot() {
    var self = this;
    if (this._xrSnapPending) {
      return Promise.reject(new Error('Snapshot already pending — look at your sculpt'));
    }
    var aimMs = this.getXRSnapshotAimMs();
    var after = ((typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now()) + aimMs;
    return new Promise(function (resolve, reject) {
      self._xrSnapPending = {
        resolve: resolve,
        reject: reject,
        after: after,
        // Same overlays as Local Record (dock + controllers in the virtual view).
        hideDock: false
      };
      XRRemoteLog.see('MR', 'Local Snapshot armed — look at your sculpt', {
        aim_ms: aimMs,
        note: 'capture runs from current headset pose after aim delay'
      });
    });
  }

  /** Cancel a waiting XR still (session end / re-entry). */
  _cancelPendingXRSnapshot(reason) {
    var p = this._xrSnapPending;
    if (!p) return;
    this._xrSnapPending = null;
    try {
      p.reject(new Error(reason || 'Snapshot cancelled'));
    } catch (e) { /* ignore */ }
  }

  /**
   * Fire queued XR still once aim delay elapsed and viewer pose is fresh this frame.
   */
  _tickPendingXRSnapshot() {
    var p = this._xrSnapPending;
    if (!p || !this._xrSessionActive) return;
    if (!this._xrSnapReady) return;
    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now < p.after) return;

    this._xrSnapPending = null;
    var dock = this._xrControllerModels && this._xrControllerModels._sculptDock;
    var panel = dock && dock._panelGroup;
    var wasVisible = panel ? panel.visible !== false : true;

    try {
      if (p.hideDock && panel) panel.visible = false;
      var canvas2d = this._renderLocalSnapshotToCanvas2D();
      this._encodeLocalSnapshotCanvas(canvas2d).then(p.resolve, p.reject);
    } catch (err) {
      p.reject(err);
      this._disposeLocalCaptureCaches();
    } finally {
      if (panel) panel.visible = wasVisible;
    }
  }

  /**
   * @param {HTMLCanvasElement|null} canvas2d
   * @returns {Promise<{name:string, bytes:number}>}
   */
  _encodeLocalSnapshotCanvas(canvas2d) {
    var self = this;
    return new Promise(function (resolve, reject) {
      try {
        if (!canvas2d) {
          reject(new Error('Snapshot render failed'));
          return;
        }
        canvas2d.toBlob(function (blob) {
          if (!blob) {
            reject(new Error('Snapshot encode failed'));
            return;
          }
          var name = 'sculpt-snapshot-' + Date.now() + '.png';
          saveAs(blob, name);
          XRRemoteLog.see('MR', 'Local Snapshot saved', {
            name: name,
            bytes: blob.size,
            xr: !!self._xrSessionActive,
            mode: self._xrSessionActive ? 'fbo' : 'display',
            note: 'virtual sculpt view only — no passthrough'
          });
          resolve({ name: name, bytes: blob.size });
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    }).finally(function () {
      self._disposeLocalCaptureCaches();
    });
  }

  /**
   * Desktop still: present one full frame, then copy the on-screen canvas.
   * Avoids the offscreen FBO path that was leaving a grey viewport on the live view.
   * @returns {HTMLCanvasElement|null}
   */
  _captureDesktopCanvasTo2D() {
    if (!this._canvas || !this._gl) return null;

    // Heal any prior FBO snapshot/record that shrank the viewport.
    var vw = this._canvasWidth | 0;
    var vh = this._canvasHeight | 0;
    if (vw > 0 && vh > 0) this._gl.viewport(0, 0, vw, vh);

    this._localSnapshotPass = false;
    this._localSnapshotBusy = false;
    this._drawFullScene = true;
    this._preventRender = false;
    this.applyRender();

    var src = this._canvas;
    var w = src.width | 0;
    var h = src.height | 0;
    if (w < 2 || h < 2) return null;

    var out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    var ctx = out.getContext('2d');
    if (!ctx) return null;
    // Same-frame drawImage works without preserveDrawingBuffer.
    ctx.drawImage(src, 0, 0);
    return out;
  }

  isLocalRecording() {
    return !!(this._localRec && this._localRec.recording);
  }

  getLocalRecordFps() {
    return this._localRecFps || 24;
  }

  setLocalRecordFps(fps) {
    var n = fps | 0;
    if (LocalRecord.FPS_OPTIONS.indexOf(n) < 0) n = 24;
    this._localRecFps = n;
    if (this._localRec) this._localRec.fps = n;
  }

  getLocalRecordQuality() {
    return this._localRecQuality || 'balanced';
  }

  setLocalRecordQuality(id) {
    if (!LocalRecord.QUALITY[id]) id = 'balanced';
    this._localRecQuality = id;
  }

  /**
   * Start recording virtual sculpt view to WebM/MP4.
   * Desktop + XR: encode via a preset-sized offscreen canvas (clean bitrate, efficient res).
   * @param {{fps?:number, quality?:string}|null} [opts]
   * @returns {{fps:number, quality:string, mime:string, width:number, height:number}}
   */
  startLocalRecording(opts) {
    opts = opts || {};
    if (this.isLocalRecording())
      throw new Error('Already recording');
    if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined')
      throw new Error('Recording not supported in this browser');
    if (!this._canvas || typeof this._canvas.captureStream !== 'function')
      throw new Error('Canvas captureStream not supported in this browser');

    if (opts.fps) this.setLocalRecordFps(opts.fps);
    if (opts.quality) this.setLocalRecordQuality(opts.quality);

    var fps = this.getLocalRecordFps();
    var q = LocalRecord.QUALITY[this.getLocalRecordQuality()] || LocalRecord.QUALITY.balanced;
    var mime = LocalRecord.pickMimeType();
    if (!mime)
      throw new Error('No supported video encoder (need WebM/VP8/VP9 or MP4)');

    // Heal any leftover viewport shrink from older record builds.
    if (this._gl && this._canvasWidth > 0 && this._canvasHeight > 0)
      this._gl.viewport(0, 0, this._canvasWidth, this._canvasHeight);

    var useDisplay = !this._xrSessionActive;
    var w;
    var h;
    var mode;

    if (useDisplay) {
      // Live desktop view → scale into preset encode canvas (efficient + clean).
      mode = 'display';
      var srcW = this._canvasWidth | 0;
      var srcH = this._canvasHeight | 0;
      if (srcW < 2 || srcH < 2) {
        srcW = this._canvas.clientWidth | 0;
        srcH = this._canvas.clientHeight | 0;
      }
      var fit = LocalRecord.sizeForPreset(srcW, srcH, q);
      w = fit.w;
      h = fit.h;
    } else {
      // XR: fixed 16:9 presentation size per preset (Cast-like framing).
      mode = 'fbo';
      w = q.maxWidth | 0;
      h = q.height | 0;
      if (w < 64 || h < 64) {
        w = 1280;
        h = 720;
      }
      var evenX = LocalRecord.evenSize(w, h);
      w = evenX.w;
      h = evenX.h;
    }

    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
    }
    var stream = canvas.captureStream(0);
    var track = stream.getVideoTracks()[0];

    var chunks = [];
    var rec;
    try {
      rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: q.bits
      });
    } catch (e) {
      rec = new MediaRecorder(stream);
    }

    var self = this;
    rec.ondataavailable = function (ev) {
      if (ev.data && ev.data.size) chunks.push(ev.data);
    };

    this._localRec = {
      recording: true,
      mode: mode,
      recorder: rec,
      canvas: canvas,
      ctx: ctx,
      stream: stream,
      track: track,
      chunks: chunks,
      fps: fps,
      quality: q.id,
      mime: mime || rec.mimeType || 'video/webm',
      w: w,
      h: h,
      lastFrameAt: 0,
      startedAt: (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(),
      stopResolve: null,
      stopReject: null
    };

    rec.onerror = function (ev) {
      XRRemoteLog.see('MR', 'Local Record error', {
        error: (ev && ev.error && ev.error.message) || 'MediaRecorder error'
      });
    };

    rec.onstop = function () {
      try {
        var blob = new Blob(chunks, { type: self._localRec.mime });
        var ext = LocalRecord.extForMime(self._localRec.mime);
        var name = 'sculpt-record-' + Date.now() + '.' + ext;
        saveAs(blob, name);
        var elapsed = (((typeof performance !== 'undefined' && performance.now)
          ? performance.now() : Date.now()) - self._localRec.startedAt) / 1000;
        XRRemoteLog.see('MR', 'Local Record saved', {
          name: name,
          bytes: blob.size,
          seconds: Math.round(elapsed * 10) / 10,
          fps: self._localRec.fps,
          quality: self._localRec.quality,
          mode: self._localRec.mode,
          size: self._localRec.w + 'x' + self._localRec.h
        });
        if (self._localRec.stopResolve)
          self._localRec.stopResolve({ name: name, bytes: blob.size, seconds: elapsed });
      } catch (err) {
        if (self._localRec.stopReject) self._localRec.stopReject(err);
      }
      self._cleanupLocalRecording();
    };

    rec.start(1000);
    this._startLocalRecordDesktopLoop();
    // Prime first frame immediately.
    this._tickLocalRecording(true);

    XRRemoteLog.see('MR', 'Local Record started', {
      fps: fps,
      quality: q.id,
      bits: q.bits,
      mime: mime,
      mode: mode,
      size: w + 'x' + h
    });

    return { fps: fps, quality: q.id, mime: mime, width: w, height: h, mode: mode };
  }

  /**
   * Stop recording and download the file.
   * @returns {Promise<{name:string, bytes:number, seconds:number}>}
   */
  stopLocalRecording() {
    var self = this;
    return new Promise(function (resolve, reject) {
      if (!self.isLocalRecording()) {
        reject(new Error('Not recording'));
        return;
      }
      self._localRec.stopResolve = resolve;
      self._localRec.stopReject = reject;
      self._localRec.recording = false;
      try {
        if (self._localRec.recorder.state !== 'inactive')
          self._localRec.recorder.stop();
      } catch (err) {
        self._cleanupLocalRecording();
        reject(err);
      }
    });
  }

  _cleanupLocalRecording() {
    this._stopLocalRecordDesktopLoop();
    var r = this._localRec;
    this._localRec = null;
    if (!r) return;
    try {
      // Encode canvas stream only (never the live WebGL canvas track).
      if (r.track) r.track.stop();
      if (r.stream) {
        var tracks = r.stream.getTracks();
        var i;
        for (i = 0; i < tracks.length; ++i) tracks[i].stop();
      }
      if (r.chunks) r.chunks.length = 0;
      r.canvas = null;
      r.ctx = null;
      r.stream = null;
      r.track = null;
      r.recorder = null;
    } catch (e) { /* ignore */ }

    // Drop encode scratch buffers — not needed until the next capture.
    this._disposeLocalCaptureCaches();

    // Heal viewport if an older FBO record path left it shrunk.
    if (!this._xrSessionActive && this._gl) {
      var vw = this._canvasWidth | 0;
      var vh = this._canvasHeight | 0;
      if (vw > 0 && vh > 0) this._gl.viewport(0, 0, vw, vh);
      if (this.render) this.render();
    }
  }

  /** Free Local Snapshot / Record GPU + canvas scratch when idle. */
  _disposeLocalCaptureCaches() {
    var gl = this._gl;
    var t = this._localSnapshotTarget;
    this._localSnapshotTarget = null;
    if (t && gl) {
      try {
        if (t.fb) gl.deleteFramebuffer(t.fb);
        if (t.tex) gl.deleteTexture(t.tex);
        if (t.depth) gl.deleteRenderbuffer(t.depth);
      } catch (e) { /* ignore */ }
      t.canvas2d = null;
      t.ctx = null;
    }
    if (this._xrControllerModels && this._xrControllerModels.disposeCaptureTarget)
      this._xrControllerModels.disposeCaptureTarget();
  }

  _startLocalRecordDesktopLoop() {
    if (this._xrSessionActive) return;
    if (this._localRecDesktopRaf) return;
    var self = this;
    var loop = function () {
      self._localRecDesktopRaf = 0;
      if (!self.isLocalRecording()) return;
      self._tickLocalRecording(false);
      self._localRecDesktopRaf = window.requestAnimationFrame(loop);
    };
    this._localRecDesktopRaf = window.requestAnimationFrame(loop);
  }

  _stopLocalRecordDesktopLoop() {
    if (this._localRecDesktopRaf) {
      window.cancelAnimationFrame(this._localRecDesktopRaf);
      this._localRecDesktopRaf = 0;
    }
  }

  /**
   * After a desktop present: scale live canvas into the encode canvas + request a frame.
   */
  _notifyLocalRecordDisplayFrame() {
    var rec = this._localRec;
    if (!rec || !rec.recording || rec.mode !== 'display') return;
    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var minDt = 1000 / Math.max(1, rec.fps || 24);
    if (rec.lastFrameAt && (now - rec.lastFrameAt) < minDt)
      return;
    rec.lastFrameAt = now;
    try {
      if (rec.ctx && this._canvas) {
        if (rec.ctx.imageSmoothingEnabled !== true) {
          rec.ctx.imageSmoothingEnabled = true;
          if (rec.ctx.imageSmoothingQuality) rec.ctx.imageSmoothingQuality = 'high';
        }
        rec.ctx.drawImage(this._canvas, 0, 0, rec.w, rec.h);
      }
      if (rec.track && typeof rec.track.requestFrame === 'function')
        rec.track.requestFrame();
    } catch (e) { /* ignore */ }
  }

  /**
   * Keep frames flowing while recording.
   * Desktop: present + blit to encode canvas at preset size.
   * XR: mono presentation capture into encode canvas.
   * @param {boolean} [force]
   */
  _tickLocalRecording(force) {
    var rec = this._localRec;
    if (!rec || !rec.recording) return;

    if (rec.mode === 'display') {
      if (this._xrSessionActive) return;
      var nowD = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      var minDtD = 1000 / Math.max(1, rec.fps || 24);
      if (!force && rec.lastFrameAt && (nowD - rec.lastFrameAt) < minDtD)
        return;
      // Sync present then blit (avoids capturing a stale backbuffer).
      this._drawFullScene = true;
      this._preventRender = false;
      this.applyRender();
      return;
    }

    // FBO mono path (XR).
    if (this._xrSessionActive && !this._xrSnapReady && !force) return;

    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var minDt = 1000 / Math.max(1, rec.fps || 24);
    if (!force && rec.lastFrameAt && (now - rec.lastFrameAt) < minDt)
      return;
    rec.lastFrameAt = now;

    try {
      var src = this._renderLocalSnapshotToCanvas2D(rec.w, rec.h, { skipDesktopRefresh: true });
      if (!src || !rec.ctx) return;
      rec.ctx.drawImage(src, 0, 0, rec.w, rec.h);
      if (rec.track && typeof rec.track.requestFrame === 'function')
        rec.track.requestFrame();
    } catch (err) {
      console.warn('Local Record frame failed', err);
    }
  }

  _ensureLocalSnapshotTarget(w, h) {
    var gl = this._gl;
    var t = this._localSnapshotTarget;
    if (t && t.w === w && t.h === h) return t;

    if (t) {
      try {
        if (t.fb) gl.deleteFramebuffer(t.fb);
        if (t.tex) gl.deleteTexture(t.tex);
        if (t.depth) gl.deleteRenderbuffer(t.depth);
      } catch (e) { /* ignore */ }
    }

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    var depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL || gl.DEPTH_COMPONENT16, w, h);

    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_STENCIL_ATTACHMENT || gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER,
      depth
    );

    var canvas2d = document.createElement('canvas');
    canvas2d.width = w;
    canvas2d.height = h;
    this._localSnapshotTarget = {
      fb: fb,
      tex: tex,
      depth: depth,
      w: w,
      h: h,
      canvas2d: canvas2d,
      ctx: canvas2d.getContext('2d')
    };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._localSnapshotTarget;
  }

  /**
   * @param {number} [forceW]
   * @param {number} [forceH]
   * @param {{skipDesktopRefresh?:boolean}} [opts] unused; kept for call-site compat
   */
  _renderLocalSnapshotToCanvas2D(forceW, forceH, opts) {
    var gl = this._gl;
    if (!gl) return null;
    opts = opts || {};

    var cssW = this._canvas.clientWidth || this._canvasWidth || 1280;
    var cssH = this._canvas.clientHeight || this._canvasHeight || 720;
    var w = forceW | 0;
    var h = forceH | 0;
    if (w < 64 || h < 64) {
      w = Math.min(1920, Math.max(640, cssW | 0));
      h = Math.min(1080, Math.max(360, cssH | 0));
      if (cssW > 0 && cssH > 0) {
        var aspect = cssW / cssH;
        h = Math.round(w / aspect);
      }
    }

    var target = this._ensureLocalSnapshotTarget(w, h);
    var cam = this._camera;
    var prevVp = gl.getParameter(gl.VIEWPORT);
    this._localSnapshotBusy = true;
    this._localSnapshotPass = true;
    var cm = this._xrSessionActive ? this._xrControllerModels : null;
    var usedThreeCapture = false;

    try {
      if (this._xrSessionActive && this._xrSnapReady && cm && cm.beginCapture) {
        // Offscreen Three RT — never write capture into the live XR stereo layer
        // (bindFramebuffer(null) during a session IS the headset FB → black / stuck UI).
        usedThreeCapture = !!cm.beginCapture(w, h, 0.18, 0.19, 0.22);
        cam.applyXRSnapshotMatrices(this._xrSnapView, null);
        var fovY = (70 * Math.PI) / 180;
        mat4.perspective(cam._proj, fovY, w / Math.max(1, h), cam._near || 0.05, cam._far || 5000.0);
      } else if (this._xrSessionActive && this._xrSnapReady) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
        gl.viewport(0, 0, w, h);
        gl.disable(gl.SCISSOR_TEST);
        cam.applyXRSnapshotMatrices(this._xrSnapView, null);
        var fovY2 = (70 * Math.PI) / 180;
        mat4.perspective(cam._proj, fovY2, w / Math.max(1, h), cam._near || 0.05, cam._far || 5000.0);
        gl.clearColor(0.18, 0.19, 0.22, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
        gl.viewport(0, 0, w, h);
        gl.disable(gl.SCISSOR_TEST);
        var prevW = cam._width;
        var prevH = cam._height;
        cam._width = w;
        cam._height = h;
        if (cam.updateProjection) cam.updateProjection();
        if (cam.updateView) cam.updateView();
        gl.clearColor(0.18, 0.19, 0.22, 1.0);
        this._localSnapshotRestoreCam = { w: prevW, h: prevH };
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      }

      this.updateMeshesXR();
      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);

      // Studio-style still: grid + clay + env (same order as desktop opaque pass).
      this._drawOpaqueMeshesXR(false);
      this._drawTransparentMeshesXR();
      var sm = this.getSculptManager();
      if (sm.getToolIndex() === Enums.Tools.TRANSFORM) {
        var xf = sm.getCurrentTool();
        if (xf && xf.postRender) xf.postRender();
      } else if (this._xrSessionActive) {
        sm.getSelection().renderXR(this, !this._xrSculpting);
      }

      if (usedThreeCapture && cm.renderCaptureControllers) {
        cm.renderCaptureControllers(this._xrSnapViewHud, cam.getProjection());
      }

      var pixels = new Uint8Array(w * h * 4);
      if (usedThreeCapture && cm.readCapturePixels) {
        cm.readCapturePixels(pixels);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      }

      var ctx = target.ctx;
      var img = ctx.createImageData(w, h);
      var y;
      for (y = 0; y < h; ++y) {
        var src = (h - 1 - y) * w * 4;
        var dst = y * w * 4;
        img.data.set(pixels.subarray(src, src + w * 4), dst);
      }
      ctx.putImageData(img, 0, 0);
    } finally {
      this._localSnapshotPass = false;
      this._localSnapshotBusy = false;
      if (usedThreeCapture && cm && cm.endCapture)
        cm.endCapture();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // Recording used a smaller viewport — restore full canvas or prior region.
      var vpW = this._canvasWidth || (prevVp && prevVp[2]) || w;
      var vpH = this._canvasHeight || (prevVp && prevVp[3]) || h;
      gl.viewport(0, 0, vpW, vpH);
      gl.clearColor(0.0, 0.0, 0.0, 0.0);

      if (this._localSnapshotRestoreCam) {
        cam._width = this._localSnapshotRestoreCam.w;
        cam._height = this._localSnapshotRestoreCam.h;
        if (cam.updateProjection) cam.updateProjection();
        if (cam.updateView) cam.updateView();
        this._localSnapshotRestoreCam = null;
      }
    }

    // Desktop must not keep using this FBO path (it left a grey live view). If we
    // somehow ran it outside XR, fully reset canvas/RTT state instead of a light redraw.
    if (!this._xrSessionActive && this.onCanvasResize)
      this.onCanvasResize();

    return target.canvas2d;
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
    this._cancelPendingXRSnapshot('XR session ended');
    // Always end an in-progress stroke — even if the sculpting flag was lost mid-glitch.
    try {
      this.getSculptManager().end();
    } catch (e) { /* ignore */ }
    this._xrSculpting = false;
    this._xrSculptLogged = false;
    this._xrTriggerLatched = false;
    Tablet.clearXRAnalog();
    this._xrRayNear = null;
    this._xrRayFar = null;
    this._xrRayUp = null;
    this._xrRayRight = null;
    this._xrRightStickX = 0;
    this._xrRightStickY = 0;
    this.getPicking()._mesh = null;
    this.getPickingSymmetry()._mesh = null;
    this.healXRBrushSettings(false);
    this._disposeLocalCaptureCaches();
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
    // WebGL2 has uint element indices as core — OES_element_index_uint is not listed.
    // Treating a missing extension as "no uint" wrongly forces ONLY_DRAW_ARRAYS and hides Wireframe.
    var hasUintIndex = !!WebGLCaps.getWebGLExtension('OES_element_index_uint') ||
      (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
    if (!hasUintIndex)
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
      if (mesh.hasPbrMaps && mesh.hasPbrMaps())
        mesh.setShaderType(Enums.Shader.PBR);
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
