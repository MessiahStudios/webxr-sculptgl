/**
 * Pack OBJ + MTL + baked vertex-paint maps into a zip for DCC hand-off.
 */
import { saveAs } from 'file-saver';
import { zip } from 'zip';
import ExportOBJ from 'files/ExportOBJ';
import ExportMTL from 'files/ExportMTL';
import BakeVertexMaps from 'files/BakeVertexMaps';
import MeshPbrMaps from 'mesh/MeshPbrMaps';

var ExportPack = {};

function meshHasUV(mesh) {
  return !!(mesh && mesh.hasUV && mesh.hasUV());
}

function mapsForMesh(main, mesh, texSize) {
  if (mesh.hasPbrMaps && mesh.hasPbrMaps()) {
    MeshPbrMaps.flush(mesh);
    return MeshPbrMaps.toBlob(mesh.getAlbedoMapSlot()).then(function (diffuse) {
      return MeshPbrMaps.splitMetalRoughBlobs(mesh.getMetalRoughMapSlot()).then(function (split) {
        return { diffuse: diffuse, roughness: split.roughness, metalness: split.metalness };
      });
    });
  }
  return BakeVertexMaps.bakeAll(main, mesh, texSize);
}

/**
 * @param {*} main
 * @param {Array} meshes
 * @param {{
 *   baseName?: string,
 *   texSize?: number,
 *   colorZbrush?: boolean,
 *   colorAppend?: boolean
 * }} [opts]
 * @returns {Promise<{name:string, bytes:number, baked:number, skipped:number}>}
 */
ExportPack.exportOBJMapsZip = function (main, meshes, opts) {
  opts = opts || {};
  var baseName = opts.baseName || 'sculpt';
  var texSize = opts.texSize || 1024;
  var colorZbrush = opts.colorZbrush !== false;
  var colorAppend = !!opts.colorAppend;

  if (!meshes || !meshes.length)
    return Promise.reject(new Error('No meshes to export'));

  var materials = [];
  var i;
  for (i = 0; i < meshes.length; ++i) {
    materials.push({
      name: 'mesh_' + i,
      hasMaps: meshHasUV(meshes[i])
    });
  }

  var objBlob = ExportOBJ.exportOBJ(meshes, colorZbrush, colorAppend, {
    mtllib: baseName + '.mtl',
    useMaterials: true
  });
  var mtlBlob = ExportMTL.exportMTL(baseName, materials);

  // Prefer live PBR slots; else bake vertex paint to UV PNGs.
  var bakeJobs = [];
  for (i = 0; i < meshes.length; ++i) {
    if (!materials[i].hasMaps) continue;
    (function (idx) {
      bakeJobs.push(
        mapsForMesh(main, meshes[idx], texSize).then(function (maps) {
          return { idx: idx, maps: maps };
        })
      );
    })(i);
  }

  return Promise.all(bakeJobs).then(function (baked) {
    return new Promise(function (resolve, reject) {
      zip.useWebWorkers = true;
      zip.workerScriptsPath = 'worker/';
      zip.createWriter(new zip.BlobWriter('application/zip'), function (zipWriter) {
        var files = [
          { name: baseName + '.obj', blob: objBlob },
          { name: baseName + '.mtl', blob: mtlBlob }
        ];
        var b;
        for (b = 0; b < baked.length; ++b) {
          var entry = baked[b];
          var prefix = baseName + '_mesh_' + entry.idx;
          files.push({ name: prefix + '_diffuse.png', blob: entry.maps.diffuse });
          files.push({ name: prefix + '_roughness.png', blob: entry.maps.roughness });
          files.push({ name: prefix + '_metalness.png', blob: entry.maps.metalness });
        }

        var addNext = function (fi) {
          if (fi >= files.length) {
            zipWriter.close(function (blob) {
              var zipName = baseName + '_obj_maps.zip';
              saveAs(blob, zipName);
              resolve({
                name: zipName,
                bytes: blob.size,
                baked: baked.length,
                skipped: meshes.length - baked.length
              });
            });
            return;
          }
          var f = files[fi];
          zipWriter.add(f.name, new zip.BlobReader(f.blob), function () {
            addNext(fi + 1);
          });
        };
        addNext(0);
      }, function (err) {
        reject(err || new Error('zip writer failed'));
      });
    });
  });
};

export default ExportPack;
