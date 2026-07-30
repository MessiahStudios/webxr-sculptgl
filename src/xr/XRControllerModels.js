/**
 * Loads official WebXR input profile GLBs (Quest Touch Plus, etc.) for XR sessions.
 * Uses Three.js only for GLTF + rendering on the same WebGL context as SculptGL.
 * @see https://github.com/immersive-web/webxr-input-profiles
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fetchProfile, MotionController } from '@webxr-input-profiles/motion-controllers/dist/motion-controllers.module.js';
import XRRemoteLog from 'xr/XRRemoteLog';

function getProfilesBaseUrl() {
  return new URL('webxr-profiles/profiles/', window.location.href).href.replace(/\/+$/, '');
}

function addPlaceholderGrip(root) {
  var geo = new THREE.BoxGeometry(0.06, 0.09, 0.14);
  // BasicMaterial stays visible in MR / minimal lighting (Standard can look invisible).
  var mat = new THREE.MeshBasicMaterial({
    color: 0x33ccff,
    transparent: true,
    opacity: 0.95,
    depthTest: true,
    depthWrite: true
  });
  if (THREE.DoubleSide !== undefined) mat.side = THREE.DoubleSide;
  var mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'xr-controller-placeholder';
  mesh.renderOrder = 999;
  root.add(mesh);
}

/**
 * Apply MotionController visualResponses to the loaded GLB (trigger pull, button depress, stick tilt).
 * @see @webxr-input-profiles/motion-controllers README
 */
function applyMotionControllerVisuals(modelRoot, motionController) {
  if (!modelRoot || !motionController || !motionController.components) return;
  var comps = motionController.components;
  var cid;
  for (cid in comps) {
    if (!Object.prototype.hasOwnProperty.call(comps, cid)) continue;
    var component = comps[cid];
    var responses = component.visualResponses;
    if (!responses) continue;
    var rname;
    for (rname in responses) {
      if (!Object.prototype.hasOwnProperty.call(responses, rname)) continue;
      var visualResponse = responses[rname];
      var valueNode = modelRoot.getObjectByName(visualResponse.valueNodeName);
      if (!valueNode) continue;

      if (visualResponse.valueNodeProperty === 'visibility') {
        valueNode.visible = !!visualResponse.value;
      } else if (visualResponse.valueNodeProperty === 'transform') {
        var minNode = modelRoot.getObjectByName(visualResponse.minNodeName);
        var maxNode = modelRoot.getObjectByName(visualResponse.maxNodeName);
        if (!minNode || !maxNode) continue;
        var t = typeof visualResponse.value === 'number' ? visualResponse.value : 0;
        if (valueNode.quaternion && valueNode.quaternion.slerpQuaternions)
          valueNode.quaternion.slerpQuaternions(minNode.quaternion, maxNode.quaternion, t);
        if (valueNode.position && valueNode.position.lerpVectors)
          valueNode.position.lerpVectors(minNode.position, maxNode.position, t);
      }
    }
  }
}

class XRControllerModels {

  constructor(scene) {
    this._scene = scene;
    this._session = null;
    this._refSpace = null;
    this._renderer = null;
    this._loader = new GLTFLoader();
    this._loader.setCrossOrigin('anonymous');
    this._threeScene = new THREE.Scene();
    this._ambient = new THREE.AmbientLight(0xffffff, 1.15);
    this._threeScene.add(this._ambient);
    var dir = new THREE.DirectionalLight(0xffffff, 1.25);
    dir.position.set(1, 3, 2);
    this._threeScene.add(dir);
    var fill = new THREE.HemisphereLight(0x9090b0, 0x404040, 0.85);
    this._threeScene.add(fill);

    /** @type {Map<XRInputSource, { root: THREE.Group, space: XRSpace|null, motionController: MotionController|null }>} */
    this._entries = new Map();
    /** @type {Set<XRInputSource>} */
    this._pendingProfile = new Set();
    this._onInputSourcesChange = this._onInputSourcesChange.bind(this);
    this._sculptDock = null;
    this._sculptDockLoading = false;
    this._renderLogged = false;
    this._sessionGen = 0;
  }

  _ensureRenderer() {
    if (this._renderer) return;
    var gl = this._scene.getGL();
    var canvas = this._scene.getCanvas();
    this._renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      context: gl,
      alpha: true,
      antialias: false,
      depth: true,
      stencil: false,
      premultipliedAlpha: false
    });
    this._renderer.autoClear = false;
    this._renderer.setPixelRatio(1);
    this._renderer.sortObjects = true;
    if (THREE.SRGBColorSpace)
      this._renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  start(session, refSpace) {
    this.stop();
    this._sessionGen = (this._sessionGen || 0) + 1;
    var gen = this._sessionGen;
    this._session = session;
    this._refSpace = refSpace;
    this._ensureRenderer();

    session.addEventListener('inputsourceschange', this._onInputSourcesChange);
    var i;
    var sources = session.inputSources;
    for (i = 0; i < sources.length; ++i)
      this._tryAddSource(sources[i]);

    var self = this;
    [100, 400, 900, 2000].forEach(function (ms) {
      window.setTimeout(function () {
        if (self._sessionGen !== gen || !self._session || self._session !== session) return;
        var j;
        var src = session.inputSources;
        for (j = 0; j < src.length; ++j)
          self._tryAddSource(src[j]);
      }, ms);
    });
  }

  stop() {
    this._sessionGen = (this._sessionGen || 0) + 1;
    if (this._session)
      this._session.removeEventListener('inputsourceschange', this._onInputSourcesChange);
    this._session = null;
    this._refSpace = null;

    var self = this;
    this._entries.forEach(function (entry) {
      self._threeScene.remove(entry.root);
      self._disposeEntry(entry);
    });
    this._entries.clear();
    this._pendingProfile.clear();
    this._sculptDockLoading = false;
    this._renderLogged = false;
    if (this._sculptDock) {
      this._sculptDock.dispose();
      this._sculptDock = null;
    }
    // Sweep orphans (async GLB loads / incomplete prior session) so they don't freeze in place.
    var orphans = [];
    this._threeScene.children.forEach(function (c) {
      if (c && c.name && (String(c.name).indexOf('xr-controller-') === 0 || c.name === 'xr-sculpt-dock'))
        orphans.push(c);
    });
    orphans.forEach(function (c) {
      self._threeScene.remove(c);
      c.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            var m;
            for (m = 0; m < obj.material.length; ++m)
              if (obj.material[m]) obj.material[m].dispose();
          } else {
            obj.material.dispose();
          }
        }
      });
    });
  }

  _onInputSourcesChange(event) {
    var i;
    for (i = 0; i < event.removed.length; ++i)
      this._removeSource(event.removed[i]);
    for (i = 0; i < event.added.length; ++i)
      this._tryAddSource(event.added[i]);
  }

  _removeSource(inputSource) {
    var entry = this._entries.get(inputSource);
    if (!entry) return;
    this._disposeEntry(entry);
    this._threeScene.remove(entry.root);
    this._entries.delete(inputSource);
  }

  _disposeEntry(entry) {
    entry.root.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          var m;
          for (m = 0; m < obj.material.length; ++m)
            obj.material[m].dispose();
        } else {
          obj.material.dispose();
        }
      }
    });
  }

  _tryAddSource(inputSource) {
    if (!inputSource) return;
    var poseSpace = inputSource.gripSpace || inputSource.targetRaySpace || null;
    if (!poseSpace) return;
    if (this._entries.has(inputSource)) return;
    if (this._pendingProfile.has(inputSource)) return;
    this._pendingProfile.add(inputSource);

    var root = new THREE.Group();
    root.name = 'xr-controller-' + (inputSource.handedness || 'none');
    addPlaceholderGrip(root);
    this._threeScene.add(root);
    this._entries.set(inputSource, { root: root, space: poseSpace, motionController: null, modelRoot: null });
    this._attachSculptDockIfPaletteHand(inputSource, root);
    console.info('XRControllerModels: placeholder added', inputSource.handedness || 'none', poseSpace === inputSource.gripSpace ? 'gripSpace' : 'targetRaySpace');
    XRRemoteLog.see('MR', 'Controller placeholder (cyan box) attached to your ' + (inputSource.handedness || 'unknown') + ' hand — GLB model loading…', {
      handedness: inputSource.handedness,
      space: poseSpace === inputSource.gripSpace ? 'gripSpace' : 'targetRaySpace'
    });

    var base = getProfilesBaseUrl();
    var self = this;
    var gen = this._sessionGen;

    fetchProfile(inputSource, base, self._scene.getXRControllerProfileFallback(), true)
      .then(function (res) {
        if (self._sessionGen !== gen || !self._session) return;
        var entry = self._entries.get(inputSource);
        if (!entry) return;
        var r = entry.root;
        if (!res || !res.assetPath) {
          console.warn('XRControllerModels: no assetPath in profile result', res);
          return;
        }

        self._loader.load(
          res.assetPath,
          function (gltf) {
            if (self._sessionGen !== gen || !self._session) return;
            var i;
            for (i = r.children.length - 1; i >= 0; --i) {
              var ch = r.children[i];
              if (ch.name !== 'xr-sculpt-dock')
                r.remove(ch);
            }
            r.add(gltf.scene);
            var motionController = null;
            try {
              motionController = new MotionController(inputSource, res.profile, res.assetPath);
            } catch (err) {
              console.warn('XRControllerModels: MotionController failed (models still draw)', err);
            }
            self._entries.set(inputSource, {
              root: r,
              space: poseSpace,
              motionController: motionController,
              modelRoot: gltf.scene
            });
            console.info('XRControllerModels: GLB loaded', res.profile, res.assetPath);
            XRRemoteLog.see('MR', 'You should see a Meta-style controller GLB on your ' + (inputSource.handedness || 'hand') + ' — buttons should animate when you press them.', {
              profile: res.profile,
              assetPath: res.assetPath,
              handedness: inputSource.handedness
            });
          },
          undefined,
          function (err) {
            console.warn('XRControllerModels: GLB load failed, keeping placeholder', res.assetPath, err);
          }
        );
      })
      .catch(function (e) {
        console.warn('XRControllerModels: fetchProfile failed (placeholder remains)', e);
      })
      .finally(function () {
        self._pendingProfile.delete(inputSource);
      });
  }

  _attachSculptDockIfPaletteHand(inputSource, root) {
    if (!root || inputSource.handedness !== 'left') return;
    var self = this;
    var gen = this._sessionGen;
    if (this._sculptDock) {
      this._sculptDock.attachToGrip(root, this._threeScene);
      return;
    }
    if (this._sculptDockLoading) return;
    this._sculptDockLoading = true;
    import(/* webpackChunkName: "xr-dock" */ 'xr/XRSculptDock')
      .then(function (mod) {
        self._sculptDockLoading = false;
        if (self._sessionGen !== gen || !self._session) return;
        try {
          self._sculptDock = new mod.default(self._scene);
        } catch (err) {
          console.warn('XRControllerModels: Sculpt Dock init failed', err);
          return;
        }
        self._entries.forEach(function (ent, src) {
          if (src.handedness === 'left')
            self._sculptDock.attachToGrip(ent.root, self._threeScene);
        });
      })
      .catch(function (err) {
        self._sculptDockLoading = false;
        console.warn('XRControllerModels: xr-dock chunk failed', err);
      });
  }

  /** Apply right-grip temporary negative before sculpt strokes this frame. */
  sampleDockNegative(session) {
    if (this._sculptDock && this._sculptDock.sampleRightGripNegative)
      this._sculptDock.sampleRightGripNegative(session);
  }

  clearDockNegative() {
    if (!this._sculptDock) return;
    this._sculptDock._rightGripNeg = false;
    if (this._sculptDock._applyLiveNegative)
      this._sculptDock._applyLiveNegative();
  }

  _updatePoses(frame, refSpace, view) {
    var self = this;
    this._entries.forEach(function (entry, inputSource) {
      if (!entry.space) return;
      var pose = frame.getPose(entry.space, refSpace);
      if (!pose) return;
      entry.root.matrix.fromArray(pose.transform.matrix);
      entry.root.matrixAutoUpdate = false;
      entry.root.matrixWorldNeedsUpdate = true;
      if (entry.motionController && inputSource.gamepad) {
        try {
          entry.motionController.updateFromGamepad();
          applyMotionControllerVisuals(entry.modelRoot, entry.motionController);
        } catch (e) { /* ignore per-frame gamepad quirks */ }
      }
      if (self._sculptDock)
        self._sculptDock.updateInput(inputSource);
    });
    // Wrist dock: follow left grip position, face the headset (not grip rotation).
    var hx;
    var hy;
    var hz;
    try {
      var viewer = frame.getViewerPose(refSpace);
      var vp = viewer && viewer.transform && viewer.transform.position;
      if (vp) {
        hx = vp.x;
        hy = vp.y;
        hz = vp.z;
      }
    } catch (e) { /* viewer pose optional */ }
    if (hx == null && view && view.transform && view.transform.position) {
      hx = view.transform.position.x;
      hy = view.transform.position.y;
      hz = view.transform.position.z;
    }
    if (this._sculptDock && this._sculptDock.tick)
      this._sculptDock.tick(hx, hy, hz);
  }

  /**
   * Draw controller models for the current XR view (after SculptGL mesh passes).
   * Controllers are posed in XR reference space — use the raw eye view (no stage matrix).
   */
  renderEye(scene, frame, refSpace, layer, view) {
    if (!this._renderer || this._entries.size === 0) return;

    if (!this._renderLogged) {
      this._renderLogged = true;
      console.info('XRControllerModels: rendering', this._entries.size, 'controller root(s) per eye');
      XRRemoteLog.see('MR', 'Drawing ' + this._entries.size + ' controller(s) into the headset view each eye — they should track your real hands in the room.', {
        controller_roots: this._entries.size
      });
    }

    this._updatePoses(frame, refSpace, view);
    this._threeScene.updateMatrixWorld(true);

    // SculptGL camera view is inv(eye)*stage for the clay. Controllers are already in
    // reference space, so multiply only by inv(eye) or they vanish / float wrong.
    var eyeView = new Float32Array(16);
    var eyeMat = view && view.transform && view.transform.matrix;
    if (eyeMat) {
      // Column-major invert of the eye pose → view matrix
      var m = eyeMat;
      // Prefer DOMMatrix invert when available; else gl-matrix-style invert via Three.
      var inv = new THREE.Matrix4().fromArray(m).invert();
      eyeView = inv.toArray(eyeView);
    } else {
      // Fallback: strip stage from SculptGL view if present
      eyeView.set(scene.getCamera().getView());
    }

    var threeCam = new THREE.PerspectiveCamera();
    threeCam.matrixAutoUpdate = false;
    threeCam.projectionMatrix.fromArray(scene.getCamera().getProjection());
    threeCam.projectionMatrixInverse.copy(threeCam.projectionMatrix).invert();
    threeCam.matrixWorldInverse.fromArray(eyeView);
    threeCam.matrixWorld.copy(threeCam.matrixWorldInverse).invert();

    var vp = layer.getViewport(view);
    this._renderer.setViewport(vp.x, vp.y, vp.width, vp.height);
    this._renderer.setScissor(vp.x, vp.y, vp.width, vp.height);
    this._renderer.setScissorTest(true);

    this._renderer.autoClear = false;
    this._renderer.clearDepth();

    this._renderer.render(this._threeScene, threeCam);

    this._renderer.setScissorTest(false);
    if (this._renderer.resetState)
      this._renderer.resetState();
  }
}

export default XRControllerModels;
