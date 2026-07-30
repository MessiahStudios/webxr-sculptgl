import TR from 'gui/GuiTR';
import { saveAs } from 'file-saver';
import Export from 'files/Export';
import BakeVertexMaps from 'files/BakeVertexMaps';

class GuiFiles {

  constructor(guiParent, ctrlGui) {
    this._main = ctrlGui._main; // main application
    this._ctrlGui = ctrlGui;
    this._menu = null; // ui menu
    this._parent = guiParent;
    this._exportAll = true;
    this._texSize = 1024;

    this._objColorZbrush = true;
    this._objColorAppended = false;
    this.init(guiParent);
  }

  init(guiParent) {
    var menu = this._menu = guiParent.addMenu(TR('fileTitle'));

    // import
    menu.addTitle(TR('fileImportTitle'));
    menu.addButton(TR('fileAdd'), this, 'addFile' /*, 'CTRL+O/I'*/ );
    menu.addButton(TR('fileAddURL'), this, 'addFileURL');
    menu.addCheckbox(TR('fileAutoMatrix'), this._main, '_autoMatrix');
    menu.addCheckbox(TR('fileVertexSRGB'), this._main, '_vertexSRGB');

    // export
    menu.addTitle(TR('fileExportSceneTitle'));
    menu.addCheckbox(TR('fileExportAll'), this, '_exportAll');
    menu.addButton(TR('fileExportSGL'), this, 'saveFileAsSGL');
    menu.addButton(TR('fileExportOBJ'), this, 'saveFileAsOBJ' /*, 'CTRL+E'*/ );
    menu.addButton(TR('fileExportOBJMaps'), this, 'saveFileAsOBJMaps');
    menu.addButton(TR('fileExportPLY'), this, 'saveFileAsPLY');
    menu.addButton(TR('fileExportSTL'), this, 'saveFileAsSTL');
    menu.addCheckbox('OBJ color zbrush', this, '_objColorZbrush');
    menu.addCheckbox('OBJ color append', this, '_objColorAppended');
    // Sketchfab upload kept in Export code but omitted from UI — this fork is local/XR-first.

    // export texture
    menu.addTitle(TR('fileExportTextureTitle'));
    this._guiTexSize = menu.addSlider(TR('fileExportTextureSize'), 10, this.onTextureSize.bind(this), 8, 12, 1);
    this._guiTexSize.setValue(10);
    menu.addButton(TR('fileExportColor'), this, 'saveColor');
    menu.addButton(TR('fileExportRoughness'), this, 'saveRoughness');
    menu.addButton(TR('fileExportMetalness'), this, 'saveMetalness');
  }

  addFile() {
    document.getElementById('fileopen').click();
  }

  /** Fetch mesh from HTTPS URL (CORS required). Same path as ?modelurl=. */
  addFileURL() {
    var sample = 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/Duck/glTF-Binary/Duck.glb';
    var url = window.prompt(
      'Import mesh URL (obj/ply/stl/sgl/glb/gltf).\nNeeds HTTPS + CORS. Cancel to abort.',
      sample
    );
    if (!url) return;
    url = url.trim();
    if (!url) return;
    if (!this._main.getFileType(url)) {
      window.alert('Unknown file type — use a URL ending in .obj .ply .stl .sgl .glb or .gltf');
      return;
    }
    this._main.addModelURL(url);
  }

  onTextureSize(value) {
    this._texSize = 1 << value;
    this._guiTexSize.domInputText.value = this._texSize;
  }

  _getExportMeshes() {
    if (this._exportAll) return this._main.getMeshes();
    var selected = this._main.getSelectedMeshes();
    return selected.length ? selected : undefined;
  }

  saveColor() {
    this._saveTextureChannel(0, 'diffuse');
  }

  saveRoughness() {
    this._saveTextureChannel(1, 'roughness');
  }

  saveMetalness() {
    this._saveTextureChannel(2, 'metalness');
  }

  _saveTextureChannel(channel, filename) {
    var mesh = this._main.getMesh();
    if (!mesh) return;
    if (!mesh.getTexCoords()) {
      window.alert('The selected mesh has no UV!');
      return;
    }
    var self = this;
    BakeVertexMaps.bakeChannel(this._main, mesh, this._texSize || 1024, channel).then(function (blob) {
      saveAs(blob, filename + '.png');
    }).catch(function (err) {
      window.alert((err && err.message) || 'Texture bake failed');
      if (self._main.onCanvasResize) self._main.onCanvasResize();
    });
  }

  saveFileAsSGL() {
    var meshes = this._getExportMeshes();
    if (!meshes) return;
    this._save(Export.exportSGL(meshes, this._main), 'yourMesh.sgl');
  }

  saveFileAsOBJ() {
    var meshes = this._getExportMeshes();
    if (!meshes) return;
    this._save(Export.exportOBJ(meshes, this._objColorZbrush, this._objColorAppended), 'yourMesh.obj');
  }

  /** OBJ + MTL + baked diffuse/rough/metal PNGs (UV meshes only) as a zip. */
  saveFileAsOBJMaps() {
    var meshes = this._getExportMeshes();
    if (!meshes) return;
    var hasUV = false;
    var i;
    for (i = 0; i < meshes.length; ++i) {
      if (meshes[i].hasUV && meshes[i].hasUV()) {
        hasUV = true;
        break;
      }
    }
    if (!hasUV) {
      window.alert('No UVs on the export selection.\nImport a GLB/OBJ with UVs, or save plain .obj for geometry only.');
      return;
    }
    var self = this;
    Export.exportOBJMapsZip(this._main, meshes, {
      baseName: 'yourMesh',
      texSize: this._texSize || 1024,
      colorZbrush: this._objColorZbrush,
      colorAppend: this._objColorAppended
    }).catch(function (err) {
      window.alert((err && err.message) || 'OBJ+maps export failed');
      if (self._main.onCanvasResize) self._main.onCanvasResize();
    });
  }

  saveFileAsPLY() {
    var meshes = this._getExportMeshes();
    if (!meshes) return;
    this._save(Export.exportBinaryPLY(meshes), 'yourMesh.ply');
  }

  saveFileAsSTL() {
    var meshes = this._getExportMeshes();
    if (!meshes) return;
    this._save(Export.exportBinarySTL(meshes), 'yourMesh.stl');
  }

  _save(data, fileName) {
    saveAs(data, fileName);
  }

  ////////////////
  // KEY EVENTS
  ////////////////
  onKeyDown(event) {
    if (event.handled === true)
      return;

    event.stopPropagation();
    if (!this._main._focusGui)
      event.preventDefault();

    var key = event.which;
    if (event.ctrlKey && event.altKey && key === 78) { // N
      this._main.clearScene();
      event.handled = true;

    } else if (event.ctrlKey && (key === 79 || key === 73)) { // O or I
      this.addFile();
      event.handled = true;

    } else if (event.ctrlKey && key === 69) { // E
      this.saveFileAsOBJ();
      event.handled = true;
    }
  }
}

export default GuiFiles;
