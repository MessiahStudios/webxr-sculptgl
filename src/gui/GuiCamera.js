import TR from 'gui/GuiTR';
import getOptionsURL from 'misc/getOptionsURL';
import Enums from 'misc/Enums';
import BuildFlags from 'misc/BuildFlags';

class GuiCamera {

  constructor(guiParent, ctrlGui) {
    this._main = ctrlGui._main; // main application
    this._menu = null; // ui menu
    this._camera = this._main.getCamera(); // the camera
    this._cameraTimer = -1; // interval id (used for zqsd/wasd/arrow moves)
    this._cbTranslation = this.cbOnTranslation.bind(this);
    this.init(guiParent);
  }

  init(guiParent) {
    var camera = this._camera;

    // Camera fold
    var menu = this._menu = guiParent.addMenu(TR('cameraTitle'));

    // reset camera
    menu.addTitle(TR('cameraReset'));
    menu.addDualButton(TR('cameraCenter'), TR('cameraFront'), this.resetCamera.bind(this), this.resetFront.bind(this));
    menu.addDualButton(TR('cameraLeft'), TR('cameraTop'), this.resetLeft.bind(this), this.resetTop.bind(this));

    // camera type
    this._ctrlProjectionTitle = menu.addTitle(TR('cameraProjection'));
    var optionsType = [];
    optionsType[Enums.Projection.PERSPECTIVE] = TR('cameraPerspective');
    optionsType[Enums.Projection.ORTHOGRAPHIC] = TR('cameraOrthographic');
    this._ctrlProjection = menu.addCombobox('', camera.getProjectionType(), this.onCameraTypeChange.bind(this), optionsType);

    // camera fov
    this._ctrlFov = menu.addSlider(TR('cameraFov'), camera.getFov(), this.onFovChange.bind(this), 10, 90, 1);
    this._ctrlFov.setVisibility(camera.getProjectionType() === Enums.Projection.PERSPECTIVE);

    // camera mode
    menu.addTitle(TR('cameraMode'));
    var optionsMode = [];
    optionsMode[Enums.CameraMode.ORBIT] = TR('cameraOrbit');
    optionsMode[Enums.CameraMode.SPHERICAL] = TR('cameraSpherical');
    optionsMode[Enums.CameraMode.PLANE] = TR('cameraPlane');
    menu.addCombobox('', camera.getMode(), this.onCameraModeChange.bind(this), optionsMode);
    menu.addCheckbox(TR('cameraPivot'), camera.getUsePivot(), this.onPivotChange.bind(this));

    // Local Snapshot — capture what the camera sees (virtual view PNG / video).
    menu.addTitle(TR('cameraSnapshotTitle'));
    menu.addButton(TR('cameraLocalSnapshot'), this, 'saveLocalSnapshot');

    // How-to docs helpers — developer builds only (stripped from `npm run release:stable`).
    if (!BuildFlags.isStable) {
      menu.addTitle(TR('cameraHowToDocsTitle'));
      menu.addButton(TR('cameraDockUIExportAll'), this, 'saveDockUIAllTabs');
      menu.addButton(TR('cameraDesktopUIExportAll'), this, 'saveDesktopUIAllPanels');
    }

    menu.addTitle(TR('cameraRecordTitle'));
    this._recFps = this._main.getLocalRecordFps ? this._main.getLocalRecordFps() : 12;
    this._recQuality = this._main.getLocalRecordQuality ? this._main.getLocalRecordQuality() : 'balanced';
    var fpsOpts = { 15: '15', 24: '24', 30: '30' };
    this._ctrlRecFps = menu.addCombobox(TR('cameraRecordFps'), this._recFps, this.onRecFpsChange.bind(this), fpsOpts);
    var qOpts = { small: TR('cameraRecordQualitySmall'), balanced: TR('cameraRecordQualityBalanced'), high: TR('cameraRecordQualityHigh') };
    this._ctrlRecQuality = menu.addCombobox(TR('cameraRecordQuality'), this._recQuality, this.onRecQualityChange.bind(this), qOpts);
    this._ctrlRecStatus = menu.addTitle(TR('cameraRecordIdle'));
    this._ctrlRecToggle = menu.addButton(TR('cameraRecordStart'), this, 'toggleLocalRecord');

    menu.addSlider(TR('cameraSpeed'), this._main, '_cameraSpeed', 0.05, 1.0, 0.001);
    this._syncRecUi(false);
  }

  /** PNG of the current virtual sculpt view (same helper as XR OPTS). */
  saveLocalSnapshot() {
    this._main.captureLocalSnapshot().catch(function (err) {
      window.alert((err && err.message) || 'Local Snapshot failed');
    });
  }

  /** WebXR wrist-dock pack: form / paint / alpha / opts-brush / opts-paint / workspace. */
  saveDockUIAllTabs() {
    this._main.exportXRDockUIAllTabs().catch(function (err) {
      window.alert((err && err.message) || 'Dock UI export failed');
    });
  }

  /** Desktop yagui pack: sidebar folders + Files/Scene/Camera/History menus. */
  saveDesktopUIAllPanels() {
    this._main.exportDesktopUIAllPanels().then(function (list) {
      window.alert('Desktop how-to pack: ' + (list && list.length ? list.length : 0) + ' PNG(s) downloaded');
    }).catch(function (err) {
      window.alert((err && err.message) || 'Desktop UI export failed');
    });
  }

  onRecFpsChange(value) {
    this._recFps = value | 0;
    if (this._main.setLocalRecordFps) this._main.setLocalRecordFps(this._recFps);
  }

  onRecQualityChange(value) {
    this._recQuality = value;
    if (this._main.setLocalRecordQuality) this._main.setLocalRecordQuality(value);
  }

  /**
   * Topbar Menu buttons put the label on the <li> (MenuButton), not a .gui-button.
   * Update that row text + status title so Start/Stop is obvious.
   */
  _syncRecUi(recording) {
    var label = recording ? TR('cameraRecordStop') : TR('cameraRecordStart');
    var status = recording ? TR('cameraRecordActive') : TR('cameraRecordIdle');
    var btn = this._ctrlRecToggle;
    if (btn && btn.domContainer) {
      var line = btn.domContainer;
      var span = btn.domSpan;
      while (line.firstChild) line.removeChild(line.firstChild);
      line.appendChild(document.createTextNode(label));
      if (span) line.appendChild(span);
      line.style.color = recording ? '#ff6b6b' : '';
      line.style.fontWeight = recording ? 'bold' : '';
    } else if (btn && btn.domButton) {
      btn.domButton.innerHTML = label;
      btn.domButton.style.background = recording ? 'rgba(180,40,40,0.55)' : '';
    }
    if (this._ctrlRecStatus && this._ctrlRecStatus.setText)
      this._ctrlRecStatus.setText(status);
    else if (this._ctrlRecStatus && this._ctrlRecStatus.domText)
      this._ctrlRecStatus.domText.textContent = status;
  }

  toggleLocalRecord() {
    var main = this._main;
    var self = this;
    if (main.isLocalRecording && main.isLocalRecording()) {
      self._syncRecUi(false);
      main.stopLocalRecording().then(function (out) {
        self._syncRecUi(false);
        window.alert('Saved ' + out.name + '\n' + Math.round(out.bytes / 1024) + ' KB');
      }).catch(function (err) {
        self._syncRecUi(!!(main.isLocalRecording && main.isLocalRecording()));
        window.alert((err && err.message) || 'Stop record failed');
      });
      return;
    }
    try {
      main.startLocalRecording({ fps: this._recFps, quality: this._recQuality });
      this._syncRecUi(true);
    } catch (err) {
      this._syncRecUi(false);
      window.alert((err && err.message) || 'Start record failed');
    }
  }

  onCameraModeChange(value) {
    this._camera.setMode(value);
    this._main.render();
  }

  onCameraTypeChange(value) {
    this._camera.setProjectionType(value);
    this._ctrlFov.setVisibility(value === Enums.Projection.PERSPECTIVE);
    this._main.render();
  }

  onFovChange(value) {
    this._camera.setFov(value);
    this._main.render();
  }

  onKeyDown(event) {
    if (event.handled === true)
      return;

    event.stopPropagation();
    if (this._main._focusGui)
      return;

    event.preventDefault();
    var main = this._main;
    var camera = main.getCamera();
    event.handled = true;
    if (event.shiftKey && main._action === Enums.Action.CAMERA_ROTATE) {
      camera.snapClosestRotation();
      main.render();
    }

    switch (getOptionsURL.getShortKey(event.which)) {
    case Enums.KeyAction.STRIFE_LEFT:
      camera._moveX = -1;
      break;
    case Enums.KeyAction.STRIFE_RIGHT:
      camera._moveX = 1;
      break;
    case Enums.KeyAction.STRIFE_UP:
      camera._moveZ = -1;
      break;
    case Enums.KeyAction.STRIFE_DOWN:
      camera._moveZ = 1;
      break;
    default:
      event.handled = false;
    }

    if (event.handled === true && this._cameraTimer === -1) {
      this._cameraTimer = window.setInterval(this._cbTranslation, 16.6);
    }
  }

  cbOnTranslation() {
    var main = this._main;
    main.getCamera().updateTranslation();
    main.render();
  }

  /** Key released event */
  onKeyUp(event) {
    if (event.handled === true)
      return;

    event.stopPropagation();
    if (this._main._focusGui)
      return;

    event.preventDefault();
    event.handled = true;
    var camera = this._camera;

    switch (getOptionsURL.getShortKey(event.which)) {
    case Enums.KeyAction.STRIFE_LEFT:
    case Enums.KeyAction.STRIFE_RIGHT:
      camera._moveX = 0;
      break;
    case Enums.KeyAction.STRIFE_UP:
    case Enums.KeyAction.STRIFE_DOWN:
      camera._moveZ = 0;
      break;
    case Enums.KeyAction.CAMERA_RESET:
      this.resetCamera();
      break;
    case Enums.KeyAction.CAMERA_FRONT:
      this.resetFront();
      break;
    case Enums.KeyAction.CAMERA_TOP:
      this.resetTop();
      break;
    case Enums.KeyAction.CAMERA_LEFT:
      this.resetLeft();
      break;
    default:
      event.handled = false;
    }

    if (this._cameraTimer !== -1 && camera._moveX === 0 && camera._moveZ === 0) {
      clearInterval(this._cameraTimer);
      this._cameraTimer = -1;
    }
  }

  resetCamera() {
    this._camera.resetView();
    this._main.render();
  }

  resetFront() {
    this._camera.toggleViewFront();
    this._main.render();
  }

  resetLeft() {
    this._camera.toggleViewLeft();
    this._main.render();
  }

  resetTop() {
    this._camera.toggleViewTop();
    this._main.render();
  }

  onPivotChange() {
    this._camera.toggleUsePivot();
    this._main.render();
  }
}

export default GuiCamera;
