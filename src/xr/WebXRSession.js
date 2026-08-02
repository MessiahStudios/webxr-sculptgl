/**
 * WebXR bootstrap: optional VR or MR (passthrough), XRWebGLLayer, per-eye draw via Scene.drawXRFrame.
 */
import XRSetup from 'xr/XRSetup';
import XRRemoteLog from 'xr/XRRemoteLog';
import WelcomeOverlay from 'xr/WelcomeOverlay';

function xrSetupLog(tag, detail) {
  XRRemoteLog.event(tag, detail);
}

function isMRSession(session) {
  if (!session) return false;
  var blend = session.environmentBlendMode;
  return session.mode === 'immersive-ar' || blend === 'alpha-blend' || blend === 'additive';
}

function viewModeLabel(session) {
  return isMRSession(session) ? 'MR' : 'VR';
}

class WebXRSession {

  constructor(scene) {
    this._scene = scene;
    this._session = null;
    this._refSpace = null;
    this._onXRFrame = this._onXRFrame.bind(this);
    this._rafHandle = null;
    this._setupRoot = null;
    this._setupProfileSelect = null;
    this._setupModeAr = null;
    this._setupModeVr = null;
    this._setupGoBtn = null;
    this._setupStatus = null;
    this._setupPreflightToken = 0;
    this._setupPreflight = null;
    this._vrSupported = false;
    this._arSupported = false;
    this._domOverlayReported = false;
    this._gripExitStart = null;
    this._webxrBar = null;
    this._viewHeartbeatAt = 0;
    this._viewHeartbeatLoggedOnce = false;
  }

  initUI() {
    var bar = document.getElementById('webxr-bar');
    this._webxrBar = bar;
    if (bar) bar.style.display = 'none';

    var self = this;

    if (!navigator.xr) {
      this._afterXrProbe(false, false);
      return;
    }

    var enterBtn = document.getElementById('webxr-enter-mr');
    var exitBtn = document.getElementById('webxr-exit');
    var recenterBtn = document.getElementById('webxr-recenter');
    var fartherBtn = document.getElementById('webxr-farther');
    var closerBtn = document.getElementById('webxr-closer');
    var scaleUpBtn = document.getElementById('webxr-scale-up');
    var scaleDownBtn = document.getElementById('webxr-scale-down');
    var snapshotBtn = document.getElementById('webxr-snapshot');
    if (!enterBtn || !exitBtn) {
      this._afterXrProbe(XRSetup.isHeadsetBrowser(), false);
      return;
    }

    // Local Snapshot control (virtual-view PNG) — create if HTML template lacks it.
    if (!snapshotBtn && bar) {
      snapshotBtn = document.createElement('button');
      snapshotBtn.id = 'webxr-snapshot';
      snapshotBtn.type = 'button';
      snapshotBtn.textContent = 'Local Snapshot';
      snapshotBtn.title = 'Save PNG of the virtual sculpt view (not passthrough / not Quest Cast)';
      snapshotBtn.style.cssText = 'display:none;padding:10px 14px;min-height:44px;cursor:pointer;border-radius:8px;border:1px solid #444;background:#1a3344;color:#eee;font-size:15px;';
      bar.appendChild(snapshotBtn);
    }

    this._enterBtn = enterBtn;
    this._exitBtn = exitBtn;
    this._recenterBtn = recenterBtn;
    this._fartherBtn = fartherBtn;
    this._closerBtn = closerBtn;
    this._scaleUpBtn = scaleUpBtn;
    this._scaleDownBtn = scaleDownBtn;
    this._snapshotBtn = snapshotBtn;

    Promise.all([
      navigator.xr.isSessionSupported('immersive-ar'),
      navigator.xr.isSessionSupported('immersive-vr')
    ]).then(function (pair) {
      self._arSupported = !!pair[0];
      self._vrSupported = !!pair[1];
      var immersiveOk = !!(pair[0] || pair[1]);
      var onHeadset = XRSetup.isHeadsetBrowser();
      if (immersiveOk) {
        self._showPreSessionBar();
        enterBtn.style.display = '';
      } else {
        if (bar) bar.style.display = 'none';
        enterBtn.style.display = 'none';
      }
      xrSetupLog('xr_support_probe', {
        immersive_ar: self._arSupported,
        immersive_vr: self._vrSupported,
        headset_browser: onHeadset,
        xr_toolbar_visible: immersiveOk,
        enter_button_visible: immersiveOk,
        welcome_pending: WelcomeOverlay.shouldShow(),
        auto_open_setup: !!(immersiveOk && onHeadset && !WelcomeOverlay.shouldShow()),
        note: 'Welcome (if enabled) runs before headset auto XR setup; Cancel setup = stay on desktop tools.'
      });
      self._afterXrProbe(onHeadset, immersiveOk);
    }).catch(function () {
      if (bar) bar.style.display = 'none';
      enterBtn.style.display = 'none';
      self._afterXrProbe(false, false);
    });

    enterBtn.addEventListener('click', function () {
      xrSetupLog('click', {
        control: 'webxr-enter-mr',
        action: 'open_setup_modal',
        expect: 'Modal "XR sculpt setup" with profile dropdown, session type radios, status line, Cancel / Let\'s sculpt'
      });
      self._openSetupModal();
    });
    exitBtn.addEventListener('click', this.exitMR.bind(this));
    if (recenterBtn) recenterBtn.addEventListener('click', function () { this._scene.recenterXRStage(); }.bind(this));
    if (fartherBtn) fartherBtn.addEventListener('click', function () { this._scene.offsetXRDistance(0.15); }.bind(this));
    if (closerBtn) closerBtn.addEventListener('click', function () { this._scene.offsetXRDistance(-0.15); }.bind(this));
    if (scaleUpBtn) scaleUpBtn.addEventListener('click', function () { this._scene.scaleXRStage(1.15); }.bind(this));
    if (scaleDownBtn) scaleDownBtn.addEventListener('click', function () { this._scene.scaleXRStage(1.0 / 1.15); }.bind(this));
    if (snapshotBtn) {
      snapshotBtn.addEventListener('click', function () {
        xrSetupLog('click', {
          control: 'webxr-snapshot',
          action: 'local_snapshot',
          expect: 'PNG download of virtual sculpt view'
        });
        this._scene.captureLocalSnapshot().catch(function (err) {
          window.alert((err && err.message) || 'Local Snapshot failed');
        });
      }.bind(this));
    }
  }

  /**
   * After XR probe (or when XR is unavailable): welcome first, then headset setup.
   * Desktop Let's Sculpt only dismisses welcome; headset continues into XR setup.
   */
  _afterXrProbe(onHeadset, immersiveOk) {
    var self = this;
    var openHeadsetSetup = function () {
      if (self._session) return;
      if (!(immersiveOk && onHeadset)) return;
      xrSetupLog('auto_open_setup', {
        reason: 'headset_browser_with_immersive_support',
        after_welcome: true,
        expect: 'Setup modal appears; Cancel returns to desktop UI'
      });
      self._openSetupModal();
    };

    if (!WelcomeOverlay.shouldShow()) {
      if (immersiveOk && onHeadset) {
        setTimeout(openHeadsetSetup, 280);
      }
      return;
    }

    xrSetupLog('welcome_show', {
      headset_browser: !!onHeadset,
      immersive_ok: !!immersiveOk,
      expect: onHeadset && immersiveOk
        ? 'Lets Sculpt closes welcome then opens XR setup'
        : 'Lets Sculpt closes welcome; stay on desktop sculpt'
    });

    WelcomeOverlay.show({
      onHeadset: !!onHeadset,
      immersiveOk: !!immersiveOk,
      onContinue: function () {
        if (immersiveOk && onHeadset)
          openHeadsetSetup();
      }
    });
  }

  /**
   * Compact corner chip for desktop — avoids a full-width bottom strip sitting
   * on top of the setup modal (overlay root z-index dwarfs the old modal).
   */
  _showPreSessionBar() {
    var bar = this._webxrBar;
    if (!bar) return;
    bar.style.cssText = [
      'pointer-events:auto',
      'position:fixed',
      'bottom:16px',
      'right:16px',
      'left:auto',
      'top:auto',
      'z-index:1',
      'display:flex',
      'gap:8px',
      'flex-wrap:wrap',
      'justify-content:flex-end',
      'align-items:center',
      'width:auto',
      'max-width:min(360px, calc(100vw - 32px))',
      'min-height:0',
      'padding:8px',
      'background:rgba(20,22,28,0.92)',
      'border-radius:10px',
      'border:1px solid #444',
      'font-family:Open Sans,sans-serif',
      'box-sizing:border-box',
      'box-shadow:0 6px 24px rgba(0,0,0,0.35)'
    ].join(';');
  }

  _hidePreSessionBar() {
    if (this._webxrBar) this._webxrBar.style.display = 'none';
  }

  _ensureSetupModal() {
    if (this._setupRoot) return;

    var self = this;
    var root = document.createElement('div');
    root.id = 'webxr-setup-modal';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'XR sculpt setup');
    // Must sit ABOVE #webxr-dom-overlay-root (z-index ~2e9) or the XR bar eats clicks.
    root.style.cssText = [
      'display:none', 'position:fixed', 'inset:0', 'z-index:2147483646',
      'align-items:center', 'justify-content:center', 'padding:16px',
      'box-sizing:border-box', 'font-family:Open Sans,Segoe UI,sans-serif',
      'background:rgba(0,0,0,0.6)', 'pointer-events:auto',
      'overflow:auto', '-webkit-overflow-scrolling:touch'
    ].join(';');

    var panel = document.createElement('div');
    panel.style.cssText = [
      'position:relative', 'z-index:1', 'pointer-events:auto',
      'max-width:420px', 'width:100%', 'max-height:min(88vh, 720px)',
      'overflow:auto', 'padding:20px 22px', 'border-radius:10px',
      'background:#1a1d24', 'color:#e8eaef', 'box-shadow:0 12px 40px rgba(0,0,0,0.45)',
      'border:1px solid #333', 'box-sizing:border-box'
    ].join(';');
    panel.addEventListener('click', function (ev) { ev.stopPropagation(); });

    var title = document.createElement('div');
    title.textContent = 'WebXR Sculpt setup';
    title.style.cssText = 'font-size:18px;font-weight:600;margin-bottom:8px;';
    panel.appendChild(title);

    var blurb = document.createElement('p');
    blurb.style.cssText = 'margin:0 0 16px;font-size:13px;line-height:1.45;color:#aeb4c0;';
    blurb.textContent = 'Headset detected — pick Mixed reality (passthrough) or Virtual reality, then Let\'s sculpt. Prefer desktop tools? Use desktop instead — everything still works in 2D. In MR, hold BOTH grips ~2.5s to exit.';
    panel.appendChild(blurb);

    var labProfile = document.createElement('label');
    labProfile.textContent = 'Controller profile';
    labProfile.style.cssText = 'display:block;font-size:12px;color:#9aa3b2;margin-bottom:6px;';
    panel.appendChild(labProfile);

    var sel = document.createElement('select');
    sel.style.cssText = 'width:100%;padding:10px 8px;border-radius:6px;border:1px solid #444;background:#111;color:#eee;font-size:13px;margin-bottom:12px;';
    var opts = XRSetup.PROFILE_OPTIONS;
    var i;
    for (i = 0; i < opts.length; ++i) {
      var o = document.createElement('option');
      o.value = opts[i].id;
      o.textContent = opts[i].label;
      sel.appendChild(o);
    }
    sel.value = XRSetup.readSavedProfileChoice();
    panel.appendChild(sel);
    this._setupProfileSelect = sel;

    var autoBtn = document.createElement('button');
    autoBtn.type = 'button';
    autoBtn.textContent = 'Auto-detect headset';
    autoBtn.style.cssText = 'margin-bottom:16px;padding:8px 12px;border-radius:6px;border:1px solid #555;background:#2a3140;color:#dbe1ea;font-size:12px;cursor:pointer;';
    autoBtn.addEventListener('click', function () {
      var guess = XRSetup.detectProfileFromUA();
      var j;
      var found = false;
      for (j = 0; j < sel.options.length; ++j) {
        if (sel.options[j].value === guess) {
          sel.selectedIndex = j;
          found = true;
          break;
        }
      }
      if (!found) {
        sel.value = 'generic-trigger-squeeze-thumbstick';
        guess = 'generic-trigger-squeeze-thumbstick';
      }
      XRSetup.writeSavedProfileChoice(guess);
      xrSetupLog('click', {
        control: 'Auto-detect headset',
        action: 'set_profile_from_ua',
        profile_id: guess,
        profile_list_has_match: found,
        expect: 'Profile dropdown shows the detected id; status line re-runs asset check'
      });
      self._runSetupPreflight();
    });
    panel.appendChild(autoBtn);

    var modeWrap = document.createElement('div');
    modeWrap.style.cssText = 'margin-bottom:18px;';
    var modeTitle = document.createElement('div');
    modeTitle.textContent = 'Session type';
    modeTitle.style.cssText = 'font-size:12px;color:#9aa3b2;margin-bottom:8px;';
    modeWrap.appendChild(modeTitle);

    var arLab = document.createElement('label');
    arLab.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px;cursor:pointer;';
    var arIn = document.createElement('input');
    arIn.type = 'radio';
    arIn.name = 'webxr-setup-mode';
    arIn.value = 'immersive-ar';
    arLab.appendChild(arIn);
    arLab.appendChild(document.createTextNode('Mixed reality (passthrough)'));
    modeWrap.appendChild(arLab);
    this._setupModeAr = arIn;

    var vrLab = document.createElement('label');
    vrLab.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;';
    var vrIn = document.createElement('input');
    vrIn.type = 'radio';
    vrIn.name = 'webxr-setup-mode';
    vrIn.value = 'immersive-vr';
    vrLab.appendChild(vrIn);
    vrLab.appendChild(document.createTextNode('Virtual reality (opaque world)'));
    modeWrap.appendChild(vrLab);
    this._setupModeVr = vrIn;

    var savedMode = XRSetup.readSavedSessionMode();
    if (savedMode === 'immersive-vr') vrIn.checked = true;
    else arIn.checked = true;

    function logSessionTypeChange() {
      xrSetupLog('session_type_change', {
        control: 'session_type_radio',
        mode: arIn.checked ? 'immersive-ar' : 'immersive-vr',
        label: arIn.checked ? 'Mixed reality (passthrough)' : 'Virtual reality (opaque world)',
        expect: arIn.checked
          ? 'Entering XR should composite over passthrough (no full studio sky as room)'
          : 'Entering XR should show studio-style environment + grid when enabled'
      });
    }
    arIn.addEventListener('change', logSessionTypeChange);
    vrIn.addEventListener('change', logSessionTypeChange);

    panel.appendChild(modeWrap);

    var modeHint = document.createElement('p');
    modeHint.style.cssText = 'margin:-8px 0 16px;font-size:11px;line-height:1.4;color:#7a8494;';
    modeHint.textContent = 'Tip: floor grid + photo studio sky means Virtual reality is selected (or saved). For your real room, pick Mixed reality.';
    panel.appendChild(modeHint);

    var status = document.createElement('div');
    status.style.cssText = 'margin:-6px 0 14px;padding:8px 10px;border-radius:6px;background:#10151d;border:1px solid #2f3b4f;font-size:12px;color:#9db4dc;line-height:1.35;';
    status.textContent = 'Checking controller profile assets...';
    panel.appendChild(status);
    this._setupStatus = status;

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;';

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Use desktop instead';
    cancel.style.cssText = 'padding:10px 16px;border-radius:6px;border:1px solid #555;background:transparent;color:#ccc;font-size:13px;cursor:pointer;';
    cancel.addEventListener('click', function () {
      xrSetupLog('click', {
        control: 'Use desktop instead',
        action: 'close_setup_modal',
        expect: 'Modal hides; desktop sculpt UI remains fully usable; XR setup chip stays available'
      });
      self._closeSetupModal();
    });

    var go = document.createElement('button');
    go.type = 'button';
    go.textContent = "Let's sculpt";
    go.style.cssText = 'padding:10px 18px;border-radius:6px;border:1px solid #3d6b9e;background:#1f4a7a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;';
    go.disabled = true;
    go.style.opacity = '0.6';
    go.addEventListener('click', function () {
      if (!self._setupPreflight || !self._setupPreflight.ok) {
        xrSetupLog('click_blocked', {
          control: "Let's sculpt",
          reason: 'controller_preflight_not_ok',
          preflight: self._setupPreflight,
          expect: 'Status line must turn green / Let\'s sculpt enabled before this works'
        });
        window.alert('Controller assets are not ready yet. Pick a valid controller profile and wait for the readiness check.');
        return;
      }
      XRSetup.writeSavedProfileChoice(sel.value);
      var mode = arIn.checked ? 'immersive-ar' : 'immersive-vr';
      if (mode === 'immersive-vr' && !self._vrSupported) {
        xrSetupLog('click_blocked', {
          control: "Let's sculpt",
          reason: 'immersive_vr_not_supported',
          mode: mode,
          expect: 'Choose Mixed reality or use a browser that supports immersive-vr'
        });
        window.alert('VR (immersive-vr) is not supported in this browser. Choose mixed reality or try Meta Quest Browser.');
        return;
      }
      if (mode === 'immersive-ar' && !self._arSupported) {
        xrSetupLog('click_blocked', {
          control: "Let's sculpt",
          reason: 'immersive_ar_not_supported',
          mode: mode,
          expect: 'Use a headset/browser that supports immersive-ar'
        });
        window.alert('Mixed reality (immersive-ar) is not supported here.');
        return;
      }
      var resolvedProfile = XRSetup.resolveProfileFallback(sel.value);
      xrSetupLog('click', {
        control: "Let's sculpt",
        action: 'start_xr_session',
        session_mode: mode,
        profile_choice: sel.value,
        resolved_profile_fallback: resolvedProfile,
        preflight_ok: true,
        expect: 'Modal closes; XR session requests permission; immersive UI (exit/recenter) appears when session starts'
      });
      XRSetup.writeSavedSessionMode(mode);
      self._closeSetupModal();
      self._enterImmersive(mode);
    });

    row.appendChild(cancel);
    row.appendChild(go);
    panel.appendChild(row);
    this._setupGoBtn = go;

    root.appendChild(panel);
    root.addEventListener('click', function (ev) {
      if (ev.target === root) {
        xrSetupLog('click', {
          control: 'modal_backdrop',
          action: 'close_setup_modal',
          expect: 'Same as Cancel — modal hides'
        });
        self._closeSetupModal();
      }
    });
    document.body.appendChild(root);
    this._setupRoot = root;

    var syncVr = function () {
      vrIn.disabled = !self._vrSupported;
      if (!self._vrSupported && vrIn.checked) {
        arIn.checked = true;
      }
    };
    syncVr();
    setTimeout(syncVr, 500);

    sel.addEventListener('change', function () {
      XRSetup.writeSavedProfileChoice(sel.value);
      var opt = sel.options[sel.selectedIndex];
      xrSetupLog('profile_change', {
        control: 'Controller profile',
        profile_id: sel.value,
        label: opt ? opt.textContent : '',
        expect: 'Status line re-checks local webxr-profiles assets for this profile'
      });
      self._runSetupPreflight();
    });
    this._runSetupPreflight();
  }

  _openSetupModal() {
    this._ensureSetupModal();
    if (!this._setupRoot) return;
    this._scene.preloadXRControllers();
    if (this._setupProfileSelect)
      this._setupProfileSelect.value = XRSetup.readSavedProfileChoice();
    var m = XRSetup.readSavedSessionMode();
    if (m === 'immersive-vr' && this._vrSupported && this._setupModeVr) this._setupModeVr.checked = true;
    else if (this._setupModeAr) this._setupModeAr.checked = true;
    // Hide the XR chip so it cannot sit on top of Cancel / Let's sculpt.
    this._hidePreSessionBar();
    this._setupRoot.style.display = 'flex';
    var prof = this._setupProfileSelect ? this._setupProfileSelect.value : '';
    xrSetupLog('modal_open', {
      saved_session_mode: m,
      selected_session_mode: this._setupModeAr && this._setupModeAr.checked ? 'immersive-ar' : 'immersive-vr',
      profile_choice: prof,
      resolved_profile_fallback: XRSetup.resolveProfileFallback(prof),
      ar_supported: this._arSupported,
      vr_supported: this._vrSupported,
      expect: 'See title "XR sculpt setup", profile list, MR vs VR radios, yellow/blue status, disabled Let\'s sculpt until status OK'
    });
    this._runSetupPreflight();
  }

  _closeSetupModal() {
    if (this._setupRoot) {
      this._setupRoot.style.display = 'none';
      xrSetupLog('modal_closed', { expect: 'Setup hidden until Enter XR / MR is clicked again' });
    }
    if (!this._session && (this._arSupported || this._vrSupported)) {
      this._showPreSessionBar();
      if (this._enterBtn) this._enterBtn.style.display = '';
    }
  }

  _setSetupStatus(text, ok) {
    if (!this._setupStatus) return;
    this._setupStatus.textContent = text;
    this._setupStatus.style.color = ok ? '#8be0aa' : '#dcb28f';
    this._setupStatus.style.borderColor = ok ? '#2f5f46' : '#6b4b2b';
  }

  _runSetupPreflight() {
    if (!this._setupProfileSelect) return;
    var token = ++this._setupPreflightToken;
    var choice = this._setupProfileSelect.value || XRSetup.readSavedProfileChoice();
    if (this._setupGoBtn) {
      this._setupGoBtn.disabled = true;
      this._setupGoBtn.style.opacity = '0.6';
    }
    this._setSetupStatus('Checking controller profile assets...', false);

    XRSetup.preflightProfileAssets(choice).then(function (result) {
      if (token !== this._setupPreflightToken) return;
      this._setupPreflight = result;
      this._setSetupStatus(result.message, result.ok);
      if (this._setupGoBtn) {
        this._setupGoBtn.disabled = !result.ok;
        this._setupGoBtn.style.opacity = result.ok ? '1' : '0.6';
      }
      xrSetupLog('preflight_done', {
        profile_choice: choice,
        ok: result.ok,
        profile_id: result.profileId,
        asset_url: result.assetUrl,
        message: result.message,
        expect: result.ok
          ? 'Let\'s sculpt button enabled; click to enter XR'
          : 'Fix profile or deploy webxr-profiles; Let\'s sculpt stays disabled'
      });
    }.bind(this));
  }

  _enterImmersive(sessionMode) {
    var scene = this._scene;
    var gl = scene.getGL();
    if (!gl || !navigator.xr) return;

    var overlayRoot = document.getElementById('webxr-dom-overlay-root') || document.getElementById('webxr-bar');
    xrSetupLog('immersive_request_start', {
      session_mode: sessionMode,
      dom_overlay_root: overlayRoot ? overlayRoot.id : null,
      expect: 'Browser XR permission prompt may appear; then session starts or catch logs error'
    });

    function requestSession() {
      var base = {
        optionalFeatures: ['local-floor', 'local']
      };
      if (!overlayRoot) return navigator.xr.requestSession(sessionMode, base);
      var withOverlay = {
        optionalFeatures: ['local-floor', 'local', 'dom-overlay'],
        domOverlay: { root: overlayRoot }
      };
      return navigator.xr.requestSession(sessionMode, withOverlay).catch(function (err) {
        xrSetupLog('request_session_fallback', {
          reason: 'dom_overlay_or_optional_features_failed',
          error: err && err.message ? err.message : String(err),
          expect: 'Retry without dom-overlay; console may show dom-overlay unsupported in immersive-ar'
        });
        return navigator.xr.requestSession(sessionMode, base);
      });
    }

    var makeCompatible = gl.makeXRCompatible ? gl.makeXRCompatible() : Promise.resolve();
    var self = this;

    makeCompatible
      .then(function () {
        return requestSession();
      })
      .then(function (session) {
        this._session = session;
        session.addEventListener('end', this._onSessionEnd.bind(this));

        // alpha: true so color buffer can carry transparency for passthrough compositing (otherwise clear alpha is ignored).
        var layer = new window.XRWebGLLayer(session, gl, {
          alpha: true,
          depth: true,
          stencil: true,
          antialias: false
        });
        session.updateRenderState({ baseLayer: layer });
        console.info('WebXR session', session.mode, 'environmentBlendMode:', session.environmentBlendMode);

        return session.requestReferenceSpace('local-floor')
          .catch(function () {
            return session.requestReferenceSpace('local');
          })
          .then(function (refSpace) {
            this._refSpace = refSpace;
            scene._xrOrbitYaw = 0.0;
            scene._xrOrbitPitch = 0.0;
            scene._xrDistanceOffset = 0.0;
            scene._xrEntryScale = 1.0;
            scene.fitXRStageToScene();
            scene.setXRSessionActive(true);
            scene.startXRControllers(session, refSpace);
            if (this._webxrBar) this._webxrBar.style.display = 'none';
            this._enterBtn.style.display = 'none';
            // Quest MR: dom-overlay usually inactive — HTML Exit/Recenter are invisible in-headset
            // and only confuse the 2D page after exit. Use left dock SPACE/OPTS + dual-grip exit.
            this._exitBtn.style.display = 'none';
            if (this._recenterBtn) this._recenterBtn.style.display = 'none';
            if (this._fartherBtn) this._fartherBtn.style.display = 'none';
            if (this._closerBtn) this._closerBtn.style.display = 'none';
            if (this._scaleUpBtn) this._scaleUpBtn.style.display = 'none';
            if (this._scaleDownBtn) this._scaleDownBtn.style.display = 'none';
            if (scene.healXRBrushSettings)
              scene.healXRBrushSettings(true);
            this._rafHandle = session.requestAnimationFrame(this._onXRFrame);

            if (scene.markXRWorkspaceEnterFeedback)
              scene.markXRWorkspaceEnterFeedback(8000);
            var mr = isMRSession(session);
            var mode = viewModeLabel(session);
            var stage = scene.describeXRStagePlacement ? scene.describeXRStagePlacement() : null;
            var hud = scene.getXRWorkspaceHud ? scene.getXRWorkspaceHud() : null;
            xrSetupLog('immersive_session_ready', {
              requested_mode: sessionMode,
              session_mode: session.mode,
              environment_blend_mode: session.environmentBlendMode,
              is_mr_passthrough: mr,
              expect: mr
                ? 'Real room visible behind clay; no studio sky/grid; controllers on hands'
                : 'Opaque VR studio (sky/grid); clay in front of you; controllers on hands'
            });
            if (mr) {
              XRRemoteLog.see('MR', 'You should see your REAL ROOM (passthrough cameras) with the clay sculpt floating in front of you — not a closed VR box.', {
                blend: session.environmentBlendMode,
                session_mode: session.mode,
                stage: stage,
                note: 'HTML Exit/Recenter buttons often HIDDEN in MR; hold BOTH grips ~2.5s to exit'
              });
              XRRemoteLog.see('MR',
                'Workspace: clay ~' + (hud ? hud.sizeCm : 34) + 'cm at ' + (hud ? hud.scalePct : 100) +
                '%. Brush: HOLD left squeeze + stick ↕ radius · ↔ intensity. SPACE tab = scale/distance/turntable.',
                hud || stage);
            } else {
              XRRemoteLog.see('VR', 'You should see an opaque studio (sky + floor grid), NOT your real room. Clay is in front of you.', {
                blend: session.environmentBlendMode,
                stage: stage,
                workspace: hud
              });
            }
            XRRemoteLog.see(mode, 'Controllers: expect Meta Touch Plus GLBs (or cyan placeholder boxes) attached to your real hands. If missing, check later [MR VIEW] controller lines.');
          }.bind(this));
      }.bind(this))
      .catch(function (e) {
        xrSetupLog('immersive_request_failed', {
          error: e && e.message ? e.message : String(e),
          expect: 'HTTPS, user granted XR, compatible browser; check prior preflight and session mode support'
        });
        console.warn(e);
        window.alert('Could not start the XR session. Use HTTPS, allow XR permissions, and try Meta Quest Browser. If VR mode fails, switch to mixed reality in the setup panel.');
      });
  }

  _onXRFrame(time, frame) {
    var session = this._session;
    if (!session) return;

    var refSpace = this._refSpace;
    if (!refSpace) return;

    this._maybeReportDomOverlay(session);
    this._updateGripExitFallback(session);
    // session.end() clears _session synchronously — do not touch this XRFrame after that.
    if (!this._session) return;

    var pose = null;
    try {
      this._maybeViewHeartbeat(frame, session, refSpace, time);
      pose = frame.getViewerPose(refSpace);
    } catch (e) {
      // Frame invalidated (session ending) — bail quietly.
      return;
    }
    if (!pose) return;

    this._scene.updateXROrbitInput(frame, session, refSpace);
    this._scene.updateXRSculptInput(frame, session, refSpace);
    this._scene.drawXRFrame(frame, pose, session, refSpace);

    // Request next frame only while still immersed (avoids callbacks on a dead session).
    if (this._session)
      this._rafHandle = session.requestAnimationFrame(this._onXRFrame);
  }

  /**
   * Periodic "what you should see" heartbeat while immersed (throttled).
   */
  _maybeViewHeartbeat(frame, session, refSpace, time) {
    var now = time || ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
    if (this._viewHeartbeatAt && now - this._viewHeartbeatAt < 2500) return;
    this._viewHeartbeatAt = now;

    var mode = viewModeLabel(session);
    var mr = isMRSession(session);
    var sources = session.inputSources || [];
    var hands = [];
    var i;
    for (i = 0; i < sources.length; ++i) {
      var s = sources[i];
      hands.push({
        handedness: s.handedness || 'none',
        has_grip: !!s.gripSpace,
        has_ray: !!s.targetRaySpace,
        profiles: s.profiles ? s.profiles.slice(0, 3) : []
      });
    }

    var pose = frame.getViewerPose(refSpace);
    var headY = null;
    if (pose && pose.transform && pose.transform.position)
      headY = Math.round(pose.transform.position.y * 100) / 100;

    var meshes = this._scene.getMeshes ? this._scene.getMeshes() : [];
    var meshCount = meshes ? meshes.length : 0;
    var ctrl = this._scene._xrControllerModels;
    var ctrlRoots = ctrl && ctrl._entries ? ctrl._entries.size : 0;

    XRRemoteLog.see(mode, mr
      ? 'Heartbeat: room passthrough ON — clay + controllers should composite over your real furniture.'
      : 'Heartbeat: opaque VR world — you should NOT see your real room.', {
      head_height_m: headY,
      input_sources: hands,
      mesh_count: meshCount,
      controller_roots: ctrlRoots,
      blend: session.environmentBlendMode,
      session_mode: session.mode
    });

    if (!this._viewHeartbeatLoggedOnce) {
      this._viewHeartbeatLoggedOnce = true;
      if (mr && ctrlRoots === 0) {
        XRRemoteLog.see('MR', 'WARNING: no controller roots yet — you may only see clay (or nothing on hands). Waiting for xr-three / GLB load.');
      } else if (mr && ctrlRoots > 0) {
        XRRemoteLog.see('MR', 'Controllers tracked (' + ctrlRoots + ') — look at your hands for GLB models or cyan boxes.');
      }
    }
  }

  _domOverlayActive(session) {
    var st = null;
    try {
      st = session.domOverlayState;
    } catch (e) {
      return false;
    }
    return !!(st && st.type && String(st.type) !== 'none');
  }

  _maybeReportDomOverlay(session) {
    if (this._domOverlayReported) return;
    this._domOverlayReported = true;
    var active = this._domOverlayActive(session);
    xrSetupLog('dom_overlay_state', {
      active: active,
      type: (function () {
        try {
          return session.domOverlayState && session.domOverlayState.type;
        } catch (e) {
          return undefined;
        }
      })(),
      expect: active
        ? 'Bottom HTML toolbar should be visible and tappable in-headset over the scene.'
        : 'HTML toolbar may be invisible in-headset (common in immersive-ar). Hold BOTH grip buttons ~2.5s to exit; use chrome://inspect logs for [XRSetup].'
    });
  }

  _updateGripExitFallback(session) {
    if (this._domOverlayActive(session)) {
      this._gripExitStart = null;
      return;
    }
    var gripped = 0;
    var rightTrig = false;
    var i;
    var sources = session.inputSources;
    for (i = 0; i < sources.length; ++i) {
      var gp = sources[i].gamepad;
      if (!gp || !gp.buttons) continue;
      if (gp.buttons[1] && (gp.buttons[1].pressed || gp.buttons[1].value > 0.35))
        gripped++;
      // Both grips + trigger = Smooth-hold, not exit.
      if (sources[i].handedness === 'right' && gp.buttons[0] &&
          (gp.buttons[0].pressed || gp.buttons[0].value > 0.3))
        rightTrig = true;
    }
    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (gripped >= 2 && rightTrig) {
      this._gripExitStart = null;
      return;
    }
    if (gripped >= 2) {
      if (this._gripExitStart == null) this._gripExitStart = now;
      if (now - this._gripExitStart > 2500) {
        this._gripExitStart = null;
        xrSetupLog('immersive_ui_fallback', {
          action: 'both_grips_hold_exit',
          hold_ms: 2500,
          expect: 'Session ends; desktop toolbar and XR setup button return'
        });
        if (this._session) {
          var ending = this._session;
          this._session = null; // stop _onXRFrame before end() invalidates the XRFrame
          ending.end();
        }
      }
    } else {
      this._gripExitStart = null;
    }
  }

  exitMR() {
    if (this._session) {
      xrSetupLog('click', { control: 'webxr-exit', action: 'end_xr_session', expect: 'Session ends; Enter XR button returns' });
      var ending = this._session;
      this._session = null;
      ending.end();
    }
  }

  _onSessionEnd() {
    // Idempotent — grip exit / exitMR may already have nulled _session.
    if (this._rafHandle != null && this._session && typeof this._session.cancelAnimationFrame === 'function') {
      try { this._session.cancelAnimationFrame(this._rafHandle); } catch (e) { /* ignore */ }
    }
    this._rafHandle = null;
    this._session = null;
    this._refSpace = null;
    this._domOverlayReported = false;
    this._gripExitStart = null;
    this._viewHeartbeatAt = 0;
    this._viewHeartbeatLoggedOnce = false;

    var scene = this._scene;
    scene.stopXRControllers();
    if (scene.isLocalRecording && scene.isLocalRecording()) {
      scene.stopLocalRecording().catch(function () { /* ignore */ });
    }
    scene.setXRSessionActive(false);

    // XR overwrote Camera view/proj each eye — restore desktop orbit camera for picking/drag.
    var cam = scene.getCamera && scene.getCamera();
    if (cam) {
      if (cam.updateView) cam.updateView();
      if (cam.updateProjection) cam.updateProjection();
    }

    if (this._webxrBar && (this._arSupported || this._vrSupported))
      this._showPreSessionBar();
    if (this._enterBtn) this._enterBtn.style.display = '';
    if (this._exitBtn) this._exitBtn.style.display = 'none';
    if (this._recenterBtn) this._recenterBtn.style.display = 'none';
    if (this._fartherBtn) this._fartherBtn.style.display = 'none';
    if (this._closerBtn) this._closerBtn.style.display = 'none';
    if (this._scaleUpBtn) this._scaleUpBtn.style.display = 'none';
    if (this._scaleDownBtn) this._scaleDownBtn.style.display = 'none';

    var gl = scene.getGL();
    if (gl) gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    scene.render();
  }
}

export default WebXRSession;
