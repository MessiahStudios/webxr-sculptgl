/**
 * Left-hand "Sculpt Dock" — floats near the left grip and always faces the headset.
 * Offset sits above/clear of the controller so new users can still see the real buttons.
 *
 * Controls (deliberately separated so workspace-adjust doesn't flip tabs):
 *   X button     → cycle tabs (brush / surf / opts / workspace)
 *   stick Y      → cycle tools (brush/surf) or option focus (opts)
 *   stick X      → nudge paint color / hardness / rough / metal (opts)
 *   Y button     → toggle/cycle focused option (opts) OR recenter (workspace)
 *   squeeze+stick→ radius (Y) / intensity (X) — stepped, min 5%
 *                 (disabled while paint color wheel is open; squeeze+Y = brightness only)
 *   workspace + stick → Y distance, X scale (never changes tabs)
 *   workspace + squeeze+stick → turntable yaw (X) / tilt (Y)
 *   right grip   → hold = temporary negative (tools that support invert; like desktop Alt)
 *   right B      → undo
 *   right stick click → redo
 *   right stick  → orbit (or twist/scale assist while those tools are held)
 *
 * Paint: Y toggles swatches/wheel.
 *   Wheel: stick aims color · left trigger locks · squeeze+↕ brightness
 */
import * as THREE from 'three';
import XRRemoteLog from 'xr/XRRemoteLog';
import {
  XR_TABS,
  XR_TAB_LABELS,
  XR_TAB_TOOLS,
  PAINT_COLOR_PRESETS,
  applyStateToSculptManager,
  createXRSculptDockState,
  getOptsList,
  nearestPaintPreset,
  rgbToHsv,
  hsvToRgb,
  syncStateFromSculptManager
} from 'xr/XRSculptDockState';

var CANVAS_W = 512;
var CANVAS_H = 500;

function stickXY(gamepad) {
  var a = gamepad.axes;
  if (!a || a.length === 0) return { x: 0, y: 0 };
  if (a.length >= 4) {
    // Quest profiles vary: thumbstick is often 2/3, sometimes 0/1. Use the livelier pair.
    var x01 = a[0] || 0;
    var y01 = a[1] || 0;
    var x23 = a[2] || 0;
    var y23 = a[3] || 0;
    if ((x23 * x23 + y23 * y23) >= (x01 * x01 + y01 * y01))
      return { x: x23, y: y23 };
    return { x: x01, y: y01 };
  }
  return { x: a[0] || 0, y: a[1] || 0 };
}

/**
 * Digital stick step with re-arm + hold-to-repeat.
 * Tuned softer than early builds so tool cycling doesn't feel twitchy on Quest.
 */
function stickStepAxis(latched, repeatAt, v, now) {
  var FIRE = 0.62;
  var REARM = 0.28;
  var out = { step: 0, latched: latched, repeatAt: repeatAt };
  if (v >= FIRE) {
    if (latched !== 1) {
      out.step = 1;
      out.latched = 1;
      out.repeatAt = now + 480;
    } else if (now >= repeatAt) {
      out.step = 1;
      out.repeatAt = now + 200;
    }
  } else if (v <= -FIRE) {
    if (latched !== -1) {
      out.step = -1;
      out.latched = -1;
      out.repeatAt = now + 480;
    } else if (now >= repeatAt) {
      out.step = -1;
      out.repeatAt = now + 200;
    }
  } else if (v > -REARM && v < REARM) {
    out.latched = 0;
    out.repeatAt = 0;
  }
  return out;
}

function stickStepY(latched, repeatAt, y, now) {
  return stickStepAxis(latched, repeatAt, y, now);
}

function stickStepX(latched, repeatAt, x, now) {
  return stickStepAxis(latched, repeatAt, x, now);
}

function rgbCss(rgb) {
  var r = Math.round(Math.max(0, Math.min(1, rgb[0])) * 255);
  var g = Math.round(Math.max(0, Math.min(1, rgb[1])) * 255);
  var b = Math.round(Math.max(0, Math.min(1, rgb[2])) * 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function optLabel(ok, s) {
  if (ok === 'save') return 'SAVE project (.sgl)';
  if (ok === 'load') return 'LOAD last (.sgl) — replaces scene';
  if (ok === 'import') return 'IMPORT file — may fail in XR; prefer before enter';
  if (ok === 'export') return 'EXPORT .' + (s.exportFmt || 'obj').toUpperCase();
  if (ok === 'exportFmt') return 'export format: ' + (s.exportFmt || 'obj').toUpperCase();
  if (ok === 'clear') return 'CLEAR scene';
  if (ok === 'add') return 'ADD ' + (s.addShape || 'sphere').toUpperCase() + '  (stick ↔ type)';
  if (ok === 'undo') return 'UNDO  (or Right B)';
  if (ok === 'redo') return 'REDO  (or R stick click)';
  if (ok === 'eyedropper') return 'eyedropper: ' + (s.paintEyedropper ? 'ON — trigger samples' : 'OFF');
  if (ok === 'paintAll') return 'PAINT ALL (fill unmasked)';
  if (ok === 'picker') return 'picker: ' + (s.paintPicker === 'wheel' ? 'WHEEL' : 'SWATCHES');
  if (ok === 'color') {
    if (s.paintPicker === 'wheel')
      return 'color: H' + Math.round((s.paintHue || 0) * 360) + ' S' + Math.round((s.paintSat || 0) * 100) + ' V' + Math.round((s.paintVal || 1) * 100);
    var name = (PAINT_COLOR_PRESETS[s.paintColorIdx] && PAINT_COLOR_PRESETS[s.paintColorIdx].name) || 'custom';
    return 'color: ' + name;
  }
  if (ok === 'hardness') return 'hardness: ' + s.hardness + '%';
  if (ok === 'roughness') return 'roughness: ' + s.roughness + '%';
  if (ok === 'metallic') return 'metallic: ' + s.metallic + '%';
  if (ok === 'writeAlbedo') return 'write color: ' + (s.writeAlbedo ? 'ON' : 'OFF');
  if (ok === 'writeRoughness') return 'write rough: ' + (s.writeRoughness ? 'ON' : 'OFF');
  if (ok === 'writeMetalness') return 'write metal: ' + (s.writeMetalness ? 'ON' : 'OFF');
  return ok + ': ' + (s[ok] ? 'ON' : 'OFF');
}

function drawColorWheel(ctx, cx, cy, radius, hue, sat) {
  var segments = 48;
  var rings = 10;
  var i;
  var j;
  for (j = rings; j >= 1; --j) {
    var outer = radius * (j / rings);
    var inner = radius * ((j - 1) / rings);
    var s = j / rings;
    for (i = 0; i < segments; ++i) {
      var a0 = (i / segments) * Math.PI * 2;
      var a1 = ((i + 1) / segments) * Math.PI * 2;
      var h = i / segments;
      var rgb = (function (hh, ss) {
        var ii = Math.floor(hh * 6);
        var f = hh * 6 - ii;
        var v = 1;
        var p = v * (1 - ss);
        var q = v * (1 - f * ss);
        var t = v * (1 - (1 - f) * ss);
        var rr = 0;
        var gg = 0;
        var bb = 0;
        switch (ii % 6) {
        case 0: rr = v; gg = t; bb = p; break;
        case 1: rr = q; gg = v; bb = p; break;
        case 2: rr = p; gg = v; bb = t; break;
        case 3: rr = p; gg = q; bb = v; break;
        case 4: rr = t; gg = p; bb = v; break;
        case 5: rr = v; gg = p; bb = q; break;
        }
        return 'rgb(' + Math.round(rr * 255) + ',' + Math.round(gg * 255) + ',' + Math.round(bb * 255) + ')';
      })(h, s);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a0) * inner, cy + Math.sin(a0) * inner);
      ctx.lineTo(cx + Math.cos(a0) * outer, cy + Math.sin(a0) * outer);
      ctx.lineTo(cx + Math.cos(a1) * outer, cy + Math.sin(a1) * outer);
      ctx.lineTo(cx + Math.cos(a1) * inner, cy + Math.sin(a1) * inner);
      ctx.closePath();
      ctx.fillStyle = rgb;
      ctx.fill();
    }
  }
  // Selection cursor
  var ang = (hue || 0) * Math.PI * 2;
  var rr = (sat || 0) * radius;
  var px = cx + Math.cos(ang) * rr;
  var py = cy + Math.sin(ang) * rr;
  ctx.beginPath();
  ctx.arc(px, py, 7, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

class XRSculptDock {

  constructor(scene) {
    this._scene = scene;
    this.state = createXRSculptDockState();
    this._panelGroup = null;
    this._canvas = null;
    this._texture = null;
    this._material = null;
    this._mesh = null;

    this._stickLatchedY = 0;
    this._stickRepeatAt = 0;
    this._stickLatchedX = 0;
    this._stickRepeatAtX = 0;
    this._tabBtn = false;
    this._actionBtn = false;
    this._undoBtn = false;
    this._redoBtn = false;
    this._loggedTool = null;
    this._rightGripNeg = false;
    this._rightNegHud = false;
    this._wheelLocked = true;
    this._wheelAiming = false;
    this._wheelTriggerBtn = false;
    this._wheelStickRecentered = true;
    this._wheelLockedHue = 0;
    this._wheelLockedSat = 0.66;
    this._wheelLockedVal = 1;
    this._wheelPreviewHue = 0;
    this._wheelPreviewSat = 0.66;
    this._wheelPreviewVal = 1;
    this._lastWorkspaceHudLine = null;
    this._brushToastUntil = 0;
    this._brushToastKind = null;
    this._brushToastValue = null;
    this._squeezeHeld = false;

    // Follow left grip in local space, but float above the button deck (not on top of it)
    // so Quest newcomers can still see X/Y/stick/squeeze while learning. +Y ≈ toward the
    // ring/top of a Touch controller; -Z pulls slightly toward the viewer.
    this._gripRoot = null;
    this._watchOffset = new THREE.Vector3(0.0, 0.20, -0.07);
    this._tmpHead = new THREE.Vector3();
    this._tmpWorldPos = new THREE.Vector3();
    this._tmpToHead = new THREE.Vector3();
    this._tmpUp = new THREE.Vector3(0, 1, 0);
    this._tmpX = new THREE.Vector3();
    this._tmpY = new THREE.Vector3();
    this._tmpRotMat = new THREE.Matrix4();
    this._orientTarget = new THREE.Quaternion();
    this._orientReady = false;

    var self = this;
    this.state.subscribe(function () {
      self._paintCanvas();
    });
  }

  syncFromDesktop() {
    syncStateFromSculptManager(this.state, this._scene.getSculptManager());
    // After a glitch / bad squeeze session, intensity can be stuck at 0% and
    // sculpting appears completely broken. Restore a usable default.
    if (!this.state.intensity || this.state.intensity < 5) {
      this.state.set({ intensity: 50 });
      applyStateToSculptManager(this.state, this._scene);
      XRRemoteLog.see('MR', 'Intensity was 0% — restored to 50%');
    }
    this._paintCanvas();
    this._wirePaintPickCallback();
  }

  /**
   * Per-frame: billboard dock toward the headset, then refresh canvas when HUD/toast needs it.
   * @param {number} [hx] viewer position X in ref space
   * @param {number} [hy]
   * @param {number} [hz]
   */
  tick(hx, hy, hz) {
    if (hx != null && hy != null && hz != null)
      this._faceHead(hx, hy, hz);
    // After any dock applyState, re-assert grip invert so strokes see the live value.
    this._applyLiveNegative();
    if (!this._canvas) return;
    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var hud = this._scene.getXRWorkspaceHud && this._scene.getXRWorkspaceHud();
    var toastLive = this._brushToastUntil && now < this._brushToastUntil;
    var eyedropHint = !!(this.state.paintEyedropper && this.state.tool === 'paint');
    var smoothHold = !!(this._scene._xrSmoothHold);
    var need = this.state.tab === 'workspace' || (hud && hud.entryHint) || toastLive || this._squeezeHeld || eyedropHint ||
      this._rightGripNeg || smoothHold;
    if (!need) {
      this._lastWorkspaceHudLine = null;
      return;
    }
    var key = (hud ? hud.line : '') + '|' + (hud && hud.entryHint ? '1' : '0') + '|' + this.state.tab +
      '|' + (toastLive ? this._brushToastKind + this._brushToastValue : '') + '|' + (this._squeezeHeld ? 'sq' : '') +
      '|' + (eyedropHint ? 'ed' : '') + '|' + (this._rightGripNeg ? 'ng' : '') + '|' + (smoothHold ? 'sm' : '');
    if (key === this._lastWorkspaceHudLine) return;
    this._lastWorkspaceHudLine = key;
    this._paintCanvas();
  }

  /**
   * Watch pose: world position = grip × offset; +Z of the plane faces the headset.
   * Not a grip child for rotation — Quest grip matrices are written with matrixAutoUpdate
   * false, which breaks Object3D.lookAt parenting and left the panel edge-on.
   */
  _faceHead(hx, hy, hz) {
    var g = this._panelGroup;
    var grip = this._gripRoot;
    if (!g || !grip) return;

    var gp = grip.parent;
    if (gp) gp.updateWorldMatrix(true, false);
    if (grip.matrixAutoUpdate) grip.updateMatrix();
    if (gp)
      grip.matrixWorld.multiplyMatrices(gp.matrixWorld, grip.matrix);
    else
      grip.matrixWorld.copy(grip.matrix);

    var worldPos = this._tmpWorldPos.copy(this._watchOffset).applyMatrix4(grip.matrixWorld);
    g.position.copy(worldPos);

    var toHead = this._tmpToHead.subVectors(this._tmpHead.set(hx, hy, hz), worldPos);
    if (toHead.lengthSq() < 1e-8) return;
    toHead.normalize();

    var up = this._tmpUp.set(0, 1, 0);
    var xAxis = this._tmpX.crossVectors(up, toHead);
    if (xAxis.lengthSq() < 1e-6) {
      up.set(1, 0, 0);
      xAxis.crossVectors(up, toHead);
    }
    xAxis.normalize();
    var yAxis = this._tmpY.crossVectors(toHead, xAxis).normalize();

    // PlaneGeometry faces +Z — aim +Z at the headset so text is readable.
    this._tmpRotMat.makeBasis(xAxis, yAxis, toHead);
    this._orientTarget.setFromRotationMatrix(this._tmpRotMat);

    if (!this._orientReady) {
      g.quaternion.copy(this._orientTarget);
      this._orientReady = true;
      return;
    }
    g.quaternion.slerp(this._orientTarget, 0.6);
  }

  /**
   * Desktop Alt equivalent: while right grip is held, invert _negative on tools that support it.
   * Resting polarity stays in state.negative (per-tool default) — not an OPTS sticky toggle.
   */
  _toolSupportsNegative(tool) {
    return !!(tool && Object.prototype.hasOwnProperty.call(tool, '_negative'));
  }

  _effectiveNegative() {
    var base = !!this.state.negative;
    if (!this._rightGripNeg) return base;
    var sm = this._scene.getSculptManager();
    var tool = sm && sm.getCurrentTool();
    if (!this._toolSupportsNegative(tool)) return base;
    return !base;
  }

  /** Read right squeeze before the sculpt stroke (input otherwise runs later during controller draw). */
  sampleRightGripNegative(session) {
    this._rightGripNeg = false;
    if (!session || !session.inputSources) {
      this._applyLiveNegative();
      return;
    }
    var i;
    for (i = 0; i < session.inputSources.length; ++i) {
      var src = session.inputSources[i];
      if (src.handedness !== 'right' || !src.gamepad || !src.gamepad.buttons) continue;
      var b = src.gamepad.buttons[1];
      this._rightGripNeg = !!(b && (b.pressed || b.value > 0.55));
    }
    this._applyLiveNegative();
  }

  _applyLiveNegative() {
    var sm = this._scene.getSculptManager();
    var tool = sm && sm.getCurrentTool();
    if (!this._toolSupportsNegative(tool)) {
      if (this._rightNegHud) {
        this._rightNegHud = false;
        this._lastWorkspaceHudLine = null;
      }
      return;
    }
    var want = this._effectiveNegative();
    tool._negative = want;
    if (want !== this._rightNegHud) {
      this._rightNegHud = want;
      this._lastWorkspaceHudLine = null;
      if (this._canvas) this._paintCanvas();
    }
  }

  _flashBrushAdjust(kind, value) {
    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    this._brushToastUntil = now + 1600;
    this._brushToastKind = kind;
    this._brushToastValue = value;
    this._lastWorkspaceHudLine = null;
    this._paintCanvas();
  }

  _pulseHaptic(gp, strength) {
    if (!gp) return;
    try {
      var a = gp.hapticActuators && gp.hapticActuators[0];
      if (a && typeof a.pulse === 'function') {
        a.pulse(strength || 0.4, 28);
        return;
      }
      if (gp.vibrationActuator && typeof gp.vibrationActuator.playEffect === 'function') {
        gp.vibrationActuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: 28,
          weakMagnitude: strength || 0.35,
          strongMagnitude: strength || 0.35
        });
      }
    } catch (e) { /* haptics optional */ }
  }

  _commitWheelColor(gp, reason) {
    this._wheelLocked = true;
    this._wheelAiming = false;
    // Stick is usually still out when trigger fires — require recenter before re-aim.
    this._wheelStickRecentered = false;
    // Snapshot so later stick noise can't mutate the committed paint color.
    this._wheelLockedHue = this._wheelPreviewHue;
    this._wheelLockedSat = this._wheelPreviewSat;
    this._wheelLockedVal = this._wheelPreviewVal;
    this.state.setPaintHsv(this._wheelLockedHue, this._wheelLockedSat, this._wheelLockedVal);
    this._applyAndLog();
    var s = this.state;
    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    this._brushToastUntil = now + 1600;
    this._brushToastKind = 'wheelLock';
    this._brushToastValue = null;
    this._lastWorkspaceHudLine = null;
    this._paintCanvas();
    this._pulseHaptic(gp, 0.5);
    XRRemoteLog.see('MR', 'Wheel color LOCKED (' + (reason || 'release') + ')', {
      h: Math.round((s.paintHue || 0) * 360),
      s: Math.round((s.paintSat || 0) * 100),
      v: Math.round((s.paintVal === undefined ? 1 : s.paintVal) * 100),
      rgb: (s.paintColor || []).map(function (c) { return Math.round(c * 100) / 100; })
    });
  }

  /** Keep tool paint color on the last lock while stick only updates a UI preview. */
  _setWheelPreview(h, s, v) {
    this._wheelPreviewHue = ((h % 1) + 1) % 1;
    this._wheelPreviewSat = Math.max(0, Math.min(1, s));
    this._wheelPreviewVal = Math.max(0.2, Math.min(1, v));
    this._lastWorkspaceHudLine = null;
    this._paintCanvas();
  }

  _restoreCommittedPaintColor() {
    this.state.setPaintHsv(this._wheelLockedHue, this._wheelLockedSat, this._wheelLockedVal);
    this._applyAndLog();
  }

  /**
   * @param {THREE.Object3D} gripRoot left controller root (XR grip pose)
   * @param {THREE.Scene} [threeScene] XR overlay scene — panel is parented here, not under grip
   */
  attachToGrip(gripRoot, threeScene) {
    if (!gripRoot) return;
    this.detach();

    this._canvas = document.createElement('canvas');
    this._canvas.width = CANVAS_W;
    this._canvas.height = CANVAS_H;
    this._texture = new THREE.CanvasTexture(this._canvas);
    if (THREE.SRGBColorSpace)
      this._texture.colorSpace = THREE.SRGBColorSpace;
    this._texture.minFilter = THREE.LinearFilter;
    this._texture.magFilter = THREE.LinearFilter;

    var mat = new THREE.MeshBasicMaterial({
      map: this._texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this._material = mat;

    var w = 0.26;
    var h = 0.22;
    var geo = new THREE.PlaneGeometry(w, h, 1, 1);
    this._mesh = new THREE.Mesh(geo, mat);

    this._panelGroup = new THREE.Group();
    this._panelGroup.name = 'xr-sculpt-dock';
    this._panelGroup.add(this._mesh);
    // Slightly under life-size so the controller stays readable beside/under the panel.
    this._panelGroup.scale.set(1.0, 1.0, 1.0);
    this._orientReady = false;
    this._gripRoot = gripRoot;

    // Parent to the XR scene (same space as controllers), not the grip — so wrist
    // rotation does not drag the panel edge-on; _faceHead writes world pose each frame.
    var host = threeScene || gripRoot.parent || gripRoot;
    host.add(this._panelGroup);
    this.syncFromDesktop();
  }

  detach() {
    if (this._panelGroup && this._panelGroup.parent)
      this._panelGroup.parent.remove(this._panelGroup);
    this._panelGroup = null;
    this._gripRoot = null;
    this._orientReady = false;
    if (this._mesh) {
      this._mesh.geometry.dispose();
      this._mesh = null;
    }
    if (this._material) {
      this._material.dispose();
      this._material = null;
    }
    if (this._texture) {
      this._texture.dispose();
      this._texture = null;
    }
    this._canvas = null;
  }

  dispose() {
    this.detach();
  }

  _paintCanvas() {
    if (!this._canvas) return;
    var ctx = this._canvas.getContext('2d');
    var s = this.state;
    var w = CANVAS_W;
    var h = CANVAS_H;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(22,24,32,0.92)';
    ctx.strokeStyle = 'rgba(120,170,255,0.55)';
    ctx.lineWidth = 3;
    roundRect(ctx, 8, 8, w - 16, h - 16, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e8ecff';
    ctx.font = 'bold 22px system-ui,Segoe UI,sans-serif';
    ctx.fillText('Sculpt Dock', 22, 36);

    // Always-visible brush meters — scarce stick budget, high discoverability.
    var rNorm = Math.max(0, Math.min(1, (s.radius - 5) / 495));
    var iNorm = Math.max(0, Math.min(1, s.intensity / 100));
    var barX = 22;
    var barW = w - 44;
    var barH = 10;
    ctx.fillStyle = '#aab8e8';
    ctx.font = 'bold 13px system-ui,Segoe UI,sans-serif';
    ctx.fillText('Radius  ' + s.radius, barX, 58);
    ctx.fillText('Intensity  ' + s.intensity + '%', barX + 230, 58);
    ctx.fillStyle = 'rgba(40,48,70,0.9)';
    roundRect(ctx, barX, 64, barW * 0.48, barH, 4);
    ctx.fill();
    roundRect(ctx, barX + barW * 0.52, 64, barW * 0.48, barH, 4);
    ctx.fill();
    ctx.fillStyle = '#6ec8ff';
    roundRect(ctx, barX, 64, Math.max(4, barW * 0.48 * rNorm), barH, 4);
    ctx.fill();
    ctx.fillStyle = '#ffb86b';
    roundRect(ctx, barX + barW * 0.52, 64, Math.max(4, barW * 0.48 * iNorm), barH, 4);
    ctx.fill();

    var nowPaint = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var toastLive = this._brushToastUntil && nowPaint < this._brushToastUntil;
    var squeezeHint = !!this._squeezeHeld && s.tab !== 'workspace';
    var eyedropHint = !!(s.paintEyedropper && s.tool === 'paint');
    var smoothHold = !!(this._scene._xrSmoothHold);
    var negHold = !!this._rightGripNeg && this._toolSupportsNegative(this._scene.getSculptManager() && this._scene.getSculptManager().getCurrentTool());
    if (toastLive || squeezeHint || eyedropHint || smoothHold || negHold) {
      ctx.fillStyle = toastLive ? 'rgba(255,180,90,0.42)' : (eyedropHint ? 'rgba(120,200,140,0.4)' : (smoothHold || negHold ? 'rgba(255,160,80,0.4)' : 'rgba(90,140,255,0.38)'));
      roundRect(ctx, 18, 80, w - 36, 28, 6);
      ctx.fill();
      ctx.fillStyle = '#fff8ee';
      ctx.font = 'bold 13px system-ui,Segoe UI,sans-serif';
      var toastMsg = 'HOLD squeeze · stick ↕ radius · stick ↔ intensity';
      if (smoothHold)
        toastMsg = 'SMOOTH hold — both grips · trigger sculpts · release grips to restore';
      else if (negHold)
        toastMsg = 'NEGATIVE — right grip held (release = normal)';
      else if (toastLive && this._brushToastKind === 'radius')
        toastMsg = 'Radius → ' + this._brushToastValue;
      else if (toastLive && this._brushToastKind === 'intensity')
        toastMsg = 'Intensity → ' + this._brushToastValue + '%';
      else if (toastLive && this._brushToastKind === 'eyedrop')
        toastMsg = 'Eyedropper sampled · color updated';
      else if (toastLive && this._brushToastKind === 'wheelLock')
        toastMsg = 'Color locked — ready to paint';
      else if (toastLive && this._brushToastKind === 'brightness')
        toastMsg = 'Brightness → ' + this._brushToastValue + '%';
      else if (toastLive && this._brushToastKind === 'file')
        toastMsg = String(this._brushToastValue || '');
      else if (eyedropHint)
        toastMsg = 'EYEDROPPER ON — aim + right trigger to sample';
      ctx.fillText(toastMsg, 26, 98);
    } else if (s.tool === 'paint') {
      ctx.fillStyle = rgbCss(s.paintColor || PAINT_COLOR_PRESETS[0].rgb);
      roundRect(ctx, 22, 82, 28, 18, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#aab8e8';
      ctx.font = '13px system-ui,Segoe UI,sans-serif';
      var cName = (PAINT_COLOR_PRESETS[s.paintColorIdx] && PAINT_COLOR_PRESETS[s.paintColorIdx].name) || 'color';
      ctx.fillText(cName + '  H' + s.hardness + '  R' + s.roughness + '  M' + s.metallic, 58, 96);
    } else {
      ctx.fillStyle = '#aab8e8';
      ctx.font = '13px system-ui,Segoe UI,sans-serif';
      var supportsNeg = this._toolSupportsNegative(this._scene.getSculptManager() && this._scene.getSculptManager().getCurrentTool());
      var flags = '';
      if (supportsNeg)
        flags += this._effectiveNegative() ? 'NEG·ON  ' : 'grip=NEG  ';
      flags += (s.clay ? 'CLAY ' : '') + (s.symmetry ? 'SYM ' : '') + (s.culling ? 'CULL' : '');
      ctx.fillText(flags.trim() || 'left squeeze+stick = size / strength', 22, 96);
    }

    var line = 118;
    var i;
    var tabX = 22;
    var tabW = 110;
    for (i = 0; i < XR_TABS.length; ++i) {
      var tid = XR_TABS[i];
      var active = tid === s.tab;
      ctx.fillStyle = active ? 'rgba(90,140,255,0.4)' : 'rgba(60,70,90,0.4)';
      roundRect(ctx, tabX, line - 14, tabW, 28, 6);
      ctx.fill();
      ctx.fillStyle = active ? '#ffffff' : '#9ca8cc';
      ctx.font = 'bold 14px system-ui,Segoe UI,sans-serif';
      ctx.fillText((XR_TAB_LABELS[tid] || tid).toUpperCase(), tabX + 12, line + 5);
      tabX += tabW + 8;
    }

    line += 40;
    ctx.font = '14px system-ui,Segoe UI,sans-serif';

    var hud = this._scene.getXRWorkspaceHud ? this._scene.getXRWorkspaceHud() : null;
    if (hud && hud.entryHint && s.tab !== 'workspace') {
      ctx.fillStyle = 'rgba(255,180,90,0.28)';
      roundRect(ctx, 18, line - 16, w - 36, 36, 6);
      ctx.fill();
      ctx.fillStyle = '#ffd09a';
      ctx.font = 'bold 13px system-ui,Segoe UI,sans-serif';
      ctx.fillText('Clay ~' + hud.sizeCm + 'cm at ' + hud.scalePct + '% — SPACE tab to adjust', 26, line + 6);
      line += 44;
      ctx.font = '14px system-ui,Segoe UI,sans-serif';
    }

    if (s.tab === 'workspace') {
      ctx.fillStyle = '#ffd09a';
      ctx.font = 'bold 15px system-ui,Segoe UI,sans-serif';
      ctx.fillText('WORKSPACE — artist ↔ sculpture (not the mesh)', 22, line);
      line += 26;
      if (hud) {
        ctx.fillStyle = 'rgba(90,140,255,0.35)';
        roundRect(ctx, 18, line - 18, w - 36, 34, 6);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px system-ui,Segoe UI,sans-serif';
        ctx.fillText(hud.line, 26, line + 4);
        line += 36;
      }
      ctx.fillStyle = '#c8d0e8';
      ctx.font = '14px system-ui,Segoe UI,sans-serif';
      ctx.fillText('Stick Y: closer / farther', 22, line);
      line += 22;
      ctx.fillText('Stick X: smaller / larger', 22, line);
      line += 22;
      ctx.fillText('Squeeze + stick X: turntable', 22, line);
      line += 22;
      ctx.fillText('Squeeze + stick Y: tilt', 22, line);
      line += 22;
      ctx.fillText('Y button: recenter + reset size', 22, line);
      line += 22;
      ctx.fillStyle = '#8899cc';
      ctx.fillText('Right stick: ↔ orbit selection · ↕ closer/farther', 22, line);
    } else if (s.tab === 'opts') {
      ctx.fillStyle = '#ffd09a';
      if (s.tool === 'paint')
        ctx.fillText('PAINT OPTIONS — stick Y focus, X nudge, Y button cycle/toggle', 22, line);
      else
        ctx.fillText('OPTIONS — stick Y selects, Y button toggles', 22, line);
      line += 26;
      var opts = getOptsList(s);
      for (i = 0; i < opts.length; ++i) {
        var ok = opts[i];
        var on = ok === s.optFocus;
        ctx.fillStyle = on ? 'rgba(255,180,90,0.4)' : 'rgba(50,55,70,0.5)';
        roundRect(ctx, 22, line - 16, ok === 'color' ? 280 : 260, 24, 4);
        ctx.fill();
        if (ok === 'color') {
          ctx.fillStyle = rgbCss(s.paintColor || PAINT_COLOR_PRESETS[0].rgb);
          roundRect(ctx, 28, line - 12, 18, 16, 3);
          ctx.fill();
        }
        ctx.fillStyle = on ? '#fff4e8' : '#b8c0d8';
        ctx.fillText(optLabel(ok, s), ok === 'color' ? 54 : 32, line);
        line += 26;
        if (line > h - 70) break;
      }
    } else {
      ctx.fillStyle = '#8899cc';
      ctx.fillText(s.tool === 'paint' ? 'Tools · Paint palette below' : 'Tools (stick Y)', 22, line);
      line += 24;
      var tools = XR_TAB_TOOLS[s.tab] || [];
      var cols = 2;
      var cellW = 230;
      var cellH = 26;
      for (i = 0; i < tools.length; ++i) {
        var r = Math.floor(i / cols);
        var c = i % cols;
        var tk = tools[i];
        var sel = tk === s.tool;
        var cx = 22 + c * cellW;
        var cy = line + r * cellH;
        ctx.fillStyle = sel ? 'rgba(120,200,140,0.45)' : 'rgba(50,55,70,0.5)';
        roundRect(ctx, cx, cy - 16, cellW - 12, 22, 4);
        ctx.fill();
        ctx.fillStyle = sel ? '#e8ffe8' : '#b8c0d8';
        ctx.font = (sel ? 'bold ' : '') + '14px system-ui,Segoe UI,sans-serif';
        ctx.fillText(tk, cx + 10, cy);
      }

      if (s.tool === 'paint' && s.tab === 'surface') {
        line += Math.ceil(tools.length / cols) * cellH + 12;
        // Mode chips
        ctx.fillStyle = s.paintPicker !== 'wheel' ? 'rgba(120,200,140,0.45)' : 'rgba(50,55,70,0.5)';
        roundRect(ctx, 22, line - 14, 110, 24, 5);
        ctx.fill();
        ctx.fillStyle = s.paintPicker === 'wheel' ? 'rgba(120,200,140,0.45)' : 'rgba(50,55,70,0.5)';
        roundRect(ctx, 140, line - 14, 90, 24, 5);
        ctx.fill();
        ctx.fillStyle = '#e8ffe8';
        ctx.font = '13px system-ui,Segoe UI,sans-serif';
        ctx.fillText('Swatches', 34, line + 2);
        ctx.fillText('Wheel', 158, line + 2);
        ctx.fillStyle = '#ffd09a';
        ctx.fillText('Y: toggle picker', 250, line + 2);
        line += 28;

        if (s.paintPicker === 'wheel') {
          var aimH = this._wheelAiming ? this._wheelPreviewHue : (s.paintHue || 0);
          var aimS = this._wheelAiming ? this._wheelPreviewSat : (s.paintSat || 0);
          var aimV = this._wheelAiming ? this._wheelPreviewVal : (s.paintVal === undefined ? 1 : s.paintVal);
          drawColorWheel(ctx, 130, line + 78, 78, aimH, aimS);
          // Committed paint color (what right trigger paints) — stays until new lock.
          ctx.fillStyle = rgbCss(s.paintColor || [1, 1, 1]);
          roundRect(ctx, 230, line + 12, 64, 64, 8);
          ctx.fill();
          ctx.strokeStyle = this._wheelAiming ? 'rgba(255,200,90,0.9)' : 'rgba(120,220,140,0.95)';
          ctx.lineWidth = 3;
          ctx.stroke();
          if (this._wheelAiming) {
            var prevRgb = hsvToRgb(aimH, aimS, aimV);
            ctx.fillStyle = rgbCss(prevRgb);
            roundRect(ctx, 300, line + 28, 36, 36, 6);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#ffd09a';
            ctx.font = 'bold 11px system-ui,Segoe UI,sans-serif';
            ctx.fillText('next', 300, line + 78);
          }
          ctx.fillStyle = this._wheelAiming ? '#ffd09a' : '#9dffb0';
          ctx.font = 'bold 13px system-ui,Segoe UI,sans-serif';
          ctx.fillText(this._wheelAiming ? 'AIMING…' : 'LOCKED', 230, line + 96);
          ctx.fillStyle = '#c8d0e8';
          ctx.font = '12px system-ui,Segoe UI,sans-serif';
          ctx.fillText(
            'Paint H' + Math.round((s.paintHue || 0) * 360) +
            ' S' + Math.round((s.paintSat || 0) * 100) +
            ' V' + Math.round((s.paintVal === undefined ? 1 : s.paintVal) * 100),
            230, line + 114
          );
          if (this._wheelAiming) {
            ctx.fillText(
              'Aim H' + Math.round(aimH * 360) +
              ' S' + Math.round(aimS * 100) +
              ' V' + Math.round(aimV * 100),
              230, line + 130
            );
            ctx.fillText('Trigger locks new color', 230, line + 148);
          } else {
            ctx.fillText('Push stick to aim new', 230, line + 132);
            ctx.fillText('Paint keeps locked color', 230, line + 148);
          }
        } else {
          ctx.fillStyle = '#ffd09a';
          ctx.font = '13px system-ui,Segoe UI,sans-serif';
          ctx.fillText('Stick X cycles color · Opts for hardness / PBR', 22, line);
          line += 16;
          var sw = 36;
          var gap = 8;
          var perRow = 6;
          for (i = 0; i < PAINT_COLOR_PRESETS.length; ++i) {
            var pr = Math.floor(i / perRow);
            var pc = i % perRow;
            var sx = 22 + pc * (sw + gap);
            var sy = line + pr * (sw + gap);
            ctx.fillStyle = rgbCss(PAINT_COLOR_PRESETS[i].rgb);
            roundRect(ctx, sx, sy, sw, sw, 6);
            ctx.fill();
            if (i === s.paintColorIdx) {
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 3;
              ctx.stroke();
            }
          }
        }
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.font = '11px system-ui,Segoe UI,sans-serif';
    if (s.tool === 'transform')
      ctx.fillText('TRANSFORM · stick ↔ orbit COM · stick ↕ dolly toward view', 22, h - 40);
    else if (this._toolSupportsNegative(this._scene.getSculptManager() && this._scene.getSculptManager().getCurrentTool()))
      ctx.fillText('Right grip=NEG · both grips=SMOOTH · left squeeze+stick = size', 22, h - 40);
    else
      ctx.fillText('Both grips=SMOOTH · left squeeze+stick ↕ radius · ↔ intensity', 22, h - 40);
    if (s.tool === 'paint' && s.paintPicker === 'wheel')
      ctx.fillText('Wheel: aim = preview only · LEFT TRIGGER commits (paint keeps old until then)', 22, h - 22);
    else
      ctx.fillText('X: tabs  ·  Right B: undo  ·  stick click: redo  ·  both grips 2.5s exit', 22, h - 22);

    this._texture.needsUpdate = true;
  }

  _applyAndLog() {
    applyStateToSculptManager(this.state, this._scene);
    this._wirePaintPickCallback();
    if (this._loggedTool !== this.state.tool) {
      this._loggedTool = this.state.tool;
      XRRemoteLog.see('MR', 'Dock tool → ' + this.state.tool + ' (radius ' + this.state.radius + ', intensity ' + this.state.intensity + '%)', {
        tool: this.state.tool,
        tab: this.state.tab,
        clay: this.state.clay,
        negative: this.state.negative
      });
    }
  }

  /** Keep Paint eyedropper samples flowing into dock color / PBR. */
  _wirePaintPickCallback() {
    var sm = this._scene.getSculptManager();
    var tool = sm && sm.getCurrentTool();
    if (!tool || !tool.setPickCallback) return;
    var self = this;
    tool.setPickCallback(function (color, roughness, metallic) {
      if (!color) return;
      var rgb = [color[0], color[1], color[2]];
      var prev = self.state.paintColor || [0, 0, 0];
      var d = Math.abs(prev[0] - rgb[0]) + Math.abs(prev[1] - rgb[1]) + Math.abs(prev[2] - rgb[2]);
      var hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      self.state.set({
        paintColor: rgb,
        paintColorIdx: nearestPaintPreset(rgb),
        paintHue: hsv.h,
        paintSat: hsv.s,
        paintVal: hsv.v,
        roughness: Math.round(Math.max(0, Math.min(1, roughness)) * 100),
        metallic: Math.round(Math.max(0, Math.min(1, metallic)) * 100)
      });
      applyStateToSculptManager(self.state, self._scene);
      if (d > 0.04) {
        var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        self._brushToastUntil = now + 1600;
        self._brushToastKind = 'eyedrop';
        self._brushToastValue = null;
        self._lastWorkspaceHudLine = null;
        self._paintCanvas();
        XRRemoteLog.see('MR', 'Eyedropper sampled clay color', {
          rgb: rgb.map(function (c) { return Math.round(c * 100) / 100; }),
          roughness: self.state.roughness,
          metallic: self.state.metallic
        });
      }
    });
  }

  _showFileToast(msg, durationMs) {
    this._brushToastKind = 'file';
    this._brushToastValue = msg;
    var dur = durationMs || 2800;
    this._brushToastUntil = ((typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now()) + dur;
    this._paintCanvas();
  }

  _runFileAction(action) {
    var self = this;
    if (action === 'save') {
      this._scene.saveXRProject().then(function (rec) {
        var kb = Math.max(1, Math.round(rec.bytes / 1024));
        self._showFileToast('Saved .sgl · ' + kb + ' KB');
      }).catch(function (err) {
        self._showFileToast('Save failed — ' + (err && err.message ? err.message : 'error'));
      });
      return;
    }
    if (action === 'load') {
      this._scene.loadXRProject().then(function (rec) {
        self._showFileToast('Replaced scene · ' + (rec.meshCount || '?') + ' mesh(es)');
        self.syncFromDesktop();
      }).catch(function (err) {
        self._showFileToast('Load failed — ' + (err && err.message ? err.message : 'error'));
      });
      return;
    }
    if (action === 'import') {
      try {
        this._scene.importXRFilePicker();
        // Disclaimer: Quest file picker is unreliable inside immersive MR/VR.
        self._showFileToast('Import may fail in XR — exit or import before XR if picker missing', 5500);
      } catch (err) {
        self._showFileToast('Import failed — use Files before XR · ' + (err && err.message ? err.message : 'error'), 4500);
      }
      return;
    }
    if (action === 'export') {
      try {
        var out = this._scene.exportXRMesh(this.state.exportFmt || 'obj');
        self._showFileToast('Exported .' + out.fmt.toUpperCase());
      } catch (err) {
        self._showFileToast('Export failed — ' + (err && err.message ? err.message : 'error'));
      }
    }
  }

  _runSceneAction(action) {
    var self = this;
    if (action === 'clear') {
      this._scene.clearXRScene();
      this._showFileToast('Scene cleared');
      this.syncFromDesktop();
      return;
    }
    if (action === 'add') {
      try {
        this._scene.addXRShape(this.state.addShape || 'sphere');
        self._showFileToast('Added ' + (this.state.addShape || 'sphere').toUpperCase());
        self.syncFromDesktop();
      } catch (err) {
        self._showFileToast('Add failed — ' + (err && err.message ? err.message : 'error'));
      }
    }
  }

  updateInput(inputSource) {
    var gp = inputSource.gamepad;
    if (!gp) return;

    var h = inputSource.handedness;
    if (h === 'left') {
      var st = stickXY(gp);
      var squeeze = !!(gp.buttons[1] && (gp.buttons[1].pressed || gp.buttons[1].value > 0.6));
      if (squeeze !== this._squeezeHeld) {
        this._squeezeHeld = squeeze;
        this._lastWorkspaceHudLine = null;
        this._paintCanvas();
      }

      // X button = cycle tabs only (never accidental stick tab flips).
      var xPressed = !!(gp.buttons[4] && gp.buttons[4].pressed);
      if (xPressed && !this._tabBtn) {
        this.state.cycleTab(1);
        if (this.state.tab === 'shape' || this.state.tab === 'surface')
          this._applyAndLog();
      }
      this._tabBtn = xPressed;

      // Y button = toggle option (opts), recenter (workspace), or paint picker mode
      var yPressed = !!(gp.buttons[5] && gp.buttons[5].pressed);
      if (yPressed && !this._actionBtn) {
        if (this.state.tab === 'workspace') {
          this._scene.recenterXRStage();
          this._paintCanvas();
          var rh = this._scene.getXRWorkspaceHud && this._scene.getXRWorkspaceHud();
          XRRemoteLog.see('MR', 'Workspace recenter — clay size/distance reset in front of you', rh);
        } else if (this.state.tab === 'opts') {
          var action = this.state.toggleFocusedOption();
          if (action === 'undo') this._scene.undoXR();
          else if (action === 'redo') this._scene.redoXR();
          else if (action === 'paintAll') this._scene.paintAllXR();
          else if (action === 'save' || action === 'load' || action === 'export' || action === 'import')
            this._runFileAction(action);
          else if (action === 'clear' || action === 'add')
            this._runSceneAction(action);
          else this._applyAndLog();
        } else if (this.state.tool === 'paint') {
          this.state.togglePaintPicker();
          if (this.state.paintPicker === 'wheel') {
            this._wheelLocked = true;
            this._wheelAiming = false;
            this._wheelStickRecentered = true;
            this._wheelLockedHue = this.state.paintHue || 0;
            this._wheelLockedSat = this.state.paintSat || 0.66;
            this._wheelLockedVal = this.state.paintVal === undefined ? 1 : this.state.paintVal;
            this._wheelPreviewHue = this._wheelLockedHue;
            this._wheelPreviewSat = this._wheelLockedSat;
            this._wheelPreviewVal = this._wheelLockedVal;
          }
          this._applyAndLog();
          XRRemoteLog.see('MR', 'Paint picker → ' + this.state.paintPicker, {
            h: Math.round((this.state.paintHue || 0) * 360),
            s: Math.round((this.state.paintSat || 0) * 100),
            v: Math.round((this.state.paintVal === undefined ? 1 : this.state.paintVal) * 100)
          });
        }
      }
      this._actionBtn = yPressed;

      if (this.state.tab === 'workspace') {
        // Workspace never flips tools/tabs. Squeeze = turntable/tilt; otherwise scale/distance.
        if (squeeze) {
          if (Math.abs(st.x) > 0.35)
            this._scene.turntableXRStage(st.x);
          if (Math.abs(st.y) > 0.35)
            this._scene.tiltXRStage(st.y);
        } else {
          if (Math.abs(st.x) > 0.45)
            this._scene.scaleXRStage(st.x > 0 ? 1.01 : 1 / 1.01);
          if (Math.abs(st.y) > 0.4)
            this._scene.offsetXRDistance(st.y > 0 ? 0.012 : -0.012);
        }
        this._paintCanvas();
        this._stickLatchedY = 0;
        this._stickRepeatAt = 0;
        this._stickLatchedX = 0;
        this._stickRepeatAtX = 0;
        return;
      }

      /*
       * Left-hand input priority (first match wins — prevents combos fighting):
       *
       * 1) workspace tab     → stick = place/scale; squeeze+stick = turntable (no paint/radius)
       * 2) squeeze held      → radius/intensity OR wheel brightness only (no color aim/lock)
       * 3) paint + wheel     → see wheel block safeguards below
       * 4) else              → stick Y = tools; stick X = swatches/opts
       *
       * Right hand (elsewhere): trigger = sculpt/paint; grip = hold negative; B = undo; stick click = redo.
       * Left trigger is ONLY used for wheel lock (never sculpts).
       */
      if (squeeze) {
        var paintWheel = this.state.tool === 'paint' && this.state.paintPicker === 'wheel';
        var changed = false;

        // Wheel + squeeze: brightness. Aiming → preview V only; locked → committed V.
        if (paintWheel) {
          var nowBr = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          var syB = stickStepY(this._stickLatchedY, this._stickRepeatAt, -st.y, nowBr);
          this._stickLatchedY = syB.latched;
          this._stickRepeatAt = syB.repeatAt;
          if (syB.step !== 0) {
            if (this._wheelAiming) {
              var curPrev = this._wheelPreviewVal;
              var nvP = Math.max(0.2, Math.min(1, curPrev + syB.step * 0.05));
              this._setWheelPreview(this._wheelPreviewHue, this._wheelPreviewSat, nvP);
              this._restoreCommittedPaintColor();
              XRRemoteLog.see('MR', 'Wheel preview brightness → ' + Math.round(nvP * 100) + '%');
            } else {
              var curV = this.state.paintVal === undefined ? 1 : this.state.paintVal;
              var nv = Math.max(0.2, Math.min(1, curV + syB.step * 0.05));
              this.state.setPaintHsv(this.state.paintHue || 0, this.state.paintSat || 0, nv);
              this._wheelLockedVal = nv;
              this._wheelPreviewVal = nv;
              this._applyAndLog();
              var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
              this._brushToastUntil = now + 1400;
              this._brushToastKind = 'brightness';
              this._brushToastValue = Math.round(nv * 100);
              this._lastWorkspaceHudLine = null;
              this._paintCanvas();
              this._pulseHaptic(gp, 0.3);
              XRRemoteLog.see('MR', 'Wheel brightness → ' + Math.round(nv * 100) + '%');
            }
          }
          this._stickLatchedX = 0;
          this._stickRepeatAtX = 0;
          return;
        }

        // Stepped radius / intensity (not per-frame continuous) so a held squeeze
        // can't silently drain intensity to 0% in under a second.
        var nowSq = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        var syR = stickStepY(this._stickLatchedY, this._stickRepeatAt, -st.y, nowSq);
        this._stickLatchedY = syR.latched;
        this._stickRepeatAt = syR.repeatAt;
        if (syR.step !== 0) {
          var nr = Math.max(5, Math.min(500, this.state.radius + syR.step * 5));
          if (nr !== this.state.radius) {
            this.state.set({ radius: nr });
            changed = true;
            this._flashBrushAdjust('radius', nr);
            this._pulseHaptic(gp, 0.35);
            XRRemoteLog.see('MR', 'Radius → ' + nr + ' (squeeze+stick Y)');
          }
        }
        var sxI = stickStepX(this._stickLatchedX, this._stickRepeatAtX, st.x, nowSq);
        this._stickLatchedX = sxI.latched;
        this._stickRepeatAtX = sxI.repeatAt;
        if (sxI.step !== 0) {
          var ni = Math.max(5, Math.min(100, this.state.intensity + sxI.step * 5));
          if (ni !== this.state.intensity) {
            this.state.set({ intensity: ni });
            changed = true;
            this._flashBrushAdjust('intensity', ni);
            this._pulseHaptic(gp, 0.45);
            XRRemoteLog.see('MR', 'Intensity → ' + ni + '% (squeeze+stick X)');
          }
        }
        if (changed)
          this._applyAndLog();
        return;
      }

      /*
       * Paint wheel safeguards:
       *  IF left trigger pressed (edge) AND stick out (mag>0.5) → sample + LOCK
       *  IF left trigger pressed (edge) AND already locked AND stick not out → keep lock (ignore)
       *  IF left trigger held → ignore stick entirely (no wash-out on return)
       *  IF locked AND stick not recentered yet → ignore stick (even if mag high)
       *  IF locked AND stick mag < 0.3 → mark recentered
       *  IF locked AND recentered AND stick mag >= 0.7 → unlock to AIMING
       *  IF unlocked/aiming AND stick mag > 0.55 → update PREVIEW only (paint color unchanged)
       *  IF left trigger → commit preview → paint color (sequence complete)
       *  NEVER stick-release / stick-click to lock
       *  NEVER apply preview HSV to the sculpt tool until lock
       */
      var wheelEdit = this.state.tool === 'paint' && this.state.paintPicker === 'wheel' && this.state.tab === 'surface';
      if (wheelEdit) {
        var leftTrig = !!(gp.buttons[0] && (gp.buttons[0].pressed || gp.buttons[0].value > 0.55));
        var mag = Math.sqrt(st.x * st.x + st.y * st.y);

        // Trigger: complete the select sequence — only then replace paint color.
        if (leftTrig) {
          if (!this._wheelTriggerBtn) {
            if (mag > 0.5) {
              var hueT = (Math.atan2(-st.y, st.x) / (Math.PI * 2) + 1) % 1;
              var satT = Math.min(1, Math.max(0.2, (mag - 0.2) / 0.8));
              this._setWheelPreview(hueT, satT, this._wheelPreviewVal);
              this._commitWheelColor(gp, 'left-trigger');
            } else if (this._wheelAiming) {
              // Stick returned — commit last preview, keep previous if never aimed.
              this._commitWheelColor(gp, 'left-trigger-preview');
            } else {
              this._restoreCommittedPaintColor();
              XRRemoteLog.see('MR', 'Wheel lock kept (trigger while stick centered — ignored re-sample)');
            }
          }
          this._wheelTriggerBtn = true;
          this._stickLatchedY = 0;
          this._stickRepeatAt = 0;
          this._stickLatchedX = 0;
          this._stickRepeatAtX = 0;
          return;
        }
        this._wheelTriggerBtn = false;

        // Locked (not aiming): must recenter, then push out to start a NEW select sequence.
        // Paint color stays on last lock the whole time.
        if (this._wheelLocked && !this._wheelAiming) {
          if (mag < 0.3)
            this._wheelStickRecentered = true;
          if (this._wheelStickRecentered && mag >= 0.7) {
            this._wheelLocked = false;
            this._wheelAiming = true;
            var hueU = (Math.atan2(-st.y, st.x) / (Math.PI * 2) + 1) % 1;
            var satU = Math.min(1, Math.max(0.2, (mag - 0.2) / 0.8));
            this._setWheelPreview(hueU, satU, this._wheelLockedVal);
            this._restoreCommittedPaintColor();
            XRRemoteLog.see('MR', 'Wheel aiming (paint color unchanged until trigger lock)', {
              paint_h: Math.round(this._wheelLockedHue * 360),
              paint_s: Math.round(this._wheelLockedSat * 100),
              aim_h: Math.round(hueU * 360),
              aim_s: Math.round(satU * 100)
            });
          }
          this._stickLatchedY = 0;
          this._stickRepeatAt = 0;
          this._stickLatchedX = 0;
          this._stickRepeatAtX = 0;
          return;
        }

        // Aiming: preview only — do not touch committed paint color / tool.
        if (this._wheelAiming && mag > 0.55) {
          var hue = (Math.atan2(-st.y, st.x) / (Math.PI * 2) + 1) % 1;
          var sat = Math.min(1, Math.max(0.2, (mag - 0.2) / 0.8));
          this._setWheelPreview(hue, sat, this._wheelPreviewVal);
          this._restoreCommittedPaintColor();
        }
        this._stickLatchedY = 0;
        this._stickRepeatAt = 0;
        this._stickLatchedX = 0;
        this._stickRepeatAtX = 0;
        return;
      }

      // shape / surface / opts: stick Y cycles selection (hold repeats)
      var nowStick = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      var sy = stickStepY(this._stickLatchedY, this._stickRepeatAt, st.y, nowStick);
      this._stickLatchedY = sy.latched;
      this._stickRepeatAt = sy.repeatAt;
      if (sy.step !== 0) {
        this.state.cycleToolInTab(sy.step);
        if (this.state.tab !== 'opts')
          this._applyAndLog();
      }

      // Stick X: paint color on Surface, or nudge focused paint opt on Opts
      var sx = stickStepX(this._stickLatchedX, this._stickRepeatAtX, st.x, nowStick);
      this._stickLatchedX = sx.latched;
      this._stickRepeatAtX = sx.repeatAt;
      if (sx.step !== 0) {
        if (this.state.tab === 'opts') {
          this.state.nudgeFocusedOption(sx.step);
          this._applyAndLog();
        } else if (this.state.tool === 'paint') {
          this.state.cyclePaintColor(sx.step);
          this._applyAndLog();
        }
      }
    } else if (h === 'right') {
      // Right grip = temporary negative (also sampled before stroke; keep flag fresh for HUD).
      var rGrip = !!(gp.buttons[1] && (gp.buttons[1].pressed || gp.buttons[1].value > 0.55));
      this._rightGripNeg = rGrip;

      // Right B = Undo
      var bPress = !!(gp.buttons[5] && gp.buttons[5].pressed);
      if (bPress && !this._undoBtn)
        this._scene.undoXR();
      this._undoBtn = bPress;

      // Right thumbstick click = Redo
      var stickClick = !!(gp.buttons[3] && gp.buttons[3].pressed);
      if (stickClick && !this._redoBtn)
        this._scene.redoXR();
      this._redoBtn = stickClick;
    }
  }
}

function roundRect(ctx, x, y, width, height, r) {
  var rr = Math.min(r, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + width, y, x + width, y + height, rr);
  ctx.arcTo(x + width, y + height, x, y + height, rr);
  ctx.arcTo(x, y + height, x, y, rr);
  ctx.arcTo(x, y, x + width, y, rr);
  ctx.closePath();
}

export default XRSculptDock;
