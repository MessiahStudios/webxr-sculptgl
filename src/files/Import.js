import ImportOBJ from 'files/ImportOBJ';
import ImportSGL from 'files/ImportSGL';
import ImportPLY from 'files/ImportPLY';
import ImportSTL from 'files/ImportSTL';

var Import = {
  importOBJ: ImportOBJ.importOBJ,
  importSGL: ImportSGL.importSGL,
  importPLY: ImportPLY.importPLY,
  importSTL: ImportSTL.importSTL,
  /** Lazy chunk — pulls Three/GLTFLoader only when a .glb/.gltf is opened. */
  importGLTF: function (data, gl) {
    return import(/* webpackChunkName: "import-gltf" */ 'files/ImportGLTF').then(function (mod) {
      return mod.default.importGLTF(data, gl);
    });
  }
};

export default Import;
