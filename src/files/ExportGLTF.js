/**
 * Export sculpt meshes as binary glTF (.glb).
 *
 * With UVs: bake vertex paint → baseColor / roughness / metalness maps (same
 * path as OBJ+MAPS) and write them into MeshStandardMaterial.
 * Without UVs: COLOR_0 + average roughness/metalness factors (no fake maps).
 *
 * Coordinates stay Y-up (glTF / Three / SculptGL / WebXR).
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { saveAs } from 'file-saver';
import { vec3 } from 'gl-matrix';
import Utils from 'misc/Utils';
import BakeVertexMaps from 'files/BakeVertexMaps';
import MeshPbrMaps from 'mesh/MeshPbrMaps';

var ExportGLTF = {};

function meshHasUV(mesh) {
  return !!(mesh && mesh.hasUV && mesh.hasUV());
}

function sRGBToLinear(c) {
  if (c <= 0.04045) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

function blobToTexture(blob, sRGB) {
  return createImageBitmap(blob).then(function (bitmap) {
    var tex = new THREE.Texture(bitmap);
    tex.flipY = false;
    tex.colorSpace = sRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  });
}

/**
 * Expand sculpt mesh into a Three BufferGeometry (triangulated, UV seams split).
 * @returns {{ geometry: THREE.BufferGeometry, avgRough: number, avgMetal: number }}
 */
ExportGLTF._geometryFromMesh = function (mesh) {
  var vAr = mesh.getVertices();
  var cAr = mesh.getColors();
  var mAr = mesh.getMaterials();
  var nAr = mesh.getNormals();
  var fAr = mesh.getFaces();
  var matrix = mesh.getMatrix();
  var hasUV = meshHasUV(mesh);
  var uvAr = hasUV ? mesh.getTexCoords() : null;
  var fArUV = hasUV ? mesh.getFacesTexCoord() : null;
  var nbFaces = mesh.getNbFaces();

  var keyToIdx = Object.create(null);
  var positions = [];
  var normals = [];
  var colors = [];
  var uvs = [];
  var indices = [];
  var roughSum = 0;
  var metalSum = 0;
  var matCount = 0;
  var tmp = [0, 0, 0];
  var tmpN = [0, 0, 0];

  var addCorner = function (vi, uvi) {
    var key = hasUV ? (vi + ':' + uvi) : String(vi);
    if (keyToIdx[key] !== undefined) return keyToIdx[key];

    var j = vi * 3;
    tmp[0] = vAr[j];
    tmp[1] = vAr[j + 1];
    tmp[2] = vAr[j + 2];
    vec3.transformMat4(tmp, tmp, matrix);
    positions.push(tmp[0], tmp[1], tmp[2]);

    if (nAr) {
      tmpN[0] = nAr[j];
      tmpN[1] = nAr[j + 1];
      tmpN[2] = nAr[j + 2];
      // Rotate normal by upper 3x3 of mesh matrix (ignore translation).
      var nx = matrix[0] * tmpN[0] + matrix[4] * tmpN[1] + matrix[8] * tmpN[2];
      var ny = matrix[1] * tmpN[0] + matrix[5] * tmpN[1] + matrix[9] * tmpN[2];
      var nz = matrix[2] * tmpN[0] + matrix[6] * tmpN[1] + matrix[10] * tmpN[2];
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      normals.push(nx / nl, ny / nl, nz / nl);
    } else {
      normals.push(0, 1, 0);
    }

    // Vertex colors in sculpt are sRGB; glTF / Three COLOR_0 expect linear.
    if (cAr) {
      colors.push(
        sRGBToLinear(cAr[j]),
        sRGBToLinear(cAr[j + 1]),
        sRGBToLinear(cAr[j + 2])
      );
    } else {
      colors.push(1, 1, 1);
    }

    if (mAr) {
      roughSum += mAr[j];
      metalSum += mAr[j + 1];
      matCount++;
    }

    if (hasUV) {
      var uj = uvi * 2;
      uvs.push(uvAr[uj], uvAr[uj + 1]);
    }

    var idx = (positions.length / 3) - 1;
    keyToIdx[key] = idx;
    return idx;
  };

  var pushTri = function (a, b, c, ua, ub, uc) {
    indices.push(addCorner(a, ua), addCorner(b, ub), addCorner(c, uc));
  };

  var i;
  for (i = 0; i < nbFaces; ++i) {
    var id = i * 4;
    var a = fAr[id];
    var b = fAr[id + 1];
    var c = fAr[id + 2];
    var d = fAr[id + 3];
    var ua = hasUV ? fArUV[id] : 0;
    var ub = hasUV ? fArUV[id + 1] : 0;
    var uc = hasUV ? fArUV[id + 2] : 0;
    var ud = hasUV ? fArUV[id + 3] : 0;
    pushTri(a, b, c, ua, ub, uc);
    if (d !== Utils.TRI_INDEX)
      pushTri(a, c, d, ua, uc, ud);
  }

  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (hasUV)
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  return {
    geometry: geometry,
    avgRough: matCount ? (roughSum / matCount) : 0.18,
    avgMetal: matCount ? (metalSum / matCount) : 0.08
  };
};

/**
 * @param {*} main Scene
 * @param {*} mesh
 * @param {number} texSize
 * @returns {Promise<THREE.Mesh>}
 */
ExportGLTF._meshToThree = function (main, mesh, texSize) {
  var built = ExportGLTF._geometryFromMesh(mesh);
  var geometry = built.geometry;
  var hasUV = meshHasUV(mesh);

  if (!hasUV) {
    var matVert = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: built.avgRough,
      metalness: built.avgMetal,
      vertexColors: true,
      side: THREE.DoubleSide
    });
    return Promise.resolve(new THREE.Mesh(geometry, matVert));
  }

  // Prefer live PBR map slots when present (paint-over-import path).
  if (mesh.hasPbrMaps && mesh.hasPbrMaps()) {
    MeshPbrMaps.flush(mesh);
    var factors = mesh.getPbrMapFactors() || { roughness: 1, metalness: 1 };
    return Promise.all([
      MeshPbrMaps.toBlob(mesh.getAlbedoMapSlot()),
      MeshPbrMaps.toBlob(mesh.getMetalRoughMapSlot())
    ]).then(function (blobs) {
      return Promise.all([
        blobToTexture(blobs[0], true),
        blobToTexture(blobs[1], false)
      ]).then(function (texs) {
        var mat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: texs[0],
          roughness: factors.roughness,
          metalness: factors.metalness,
          metalnessMap: texs[1],
          roughnessMap: texs[1],
          vertexColors: false,
          side: THREE.DoubleSide
        });
        geometry.deleteAttribute('color');
        return new THREE.Mesh(geometry, mat);
      });
    });
  }

  return BakeVertexMaps.bakeAll(main, mesh, texSize).then(function (maps) {
    return Promise.all([
      blobToTexture(maps.diffuse, true),
      blobToTexture(maps.roughness, false),
      blobToTexture(maps.metalness, false)
    ]).then(function (texs) {
      var mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: texs[0],
        roughness: 1.0,
        metalness: 1.0,
        roughnessMap: texs[1],
        metalnessMap: texs[2],
        vertexColors: false,
        side: THREE.DoubleSide
      });
      // Maps carry paint; drop COLOR_0 so Blender doesn't double-tint.
      geometry.deleteAttribute('color');
      return new THREE.Mesh(geometry, mat);
    });
  });
};

function disposeObject3D(root) {
  if (!root) return;
  root.traverse(function (obj) {
    if (obj.geometry) obj.geometry.dispose();
    var mats = obj.material;
    if (!mats) return;
    var list = Array.isArray(mats) ? mats : [mats];
    var i;
    for (i = 0; i < list.length; ++i) {
      var m = list[i];
      if (!m) continue;
      ['map', 'roughnessMap', 'metalnessMap', 'normalMap', 'aoMap', 'emissiveMap'].forEach(function (k) {
        if (m[k]) m[k].dispose();
      });
      m.dispose();
    }
  });
}

/**
 * @param {*} main
 * @param {Array} meshes
 * @param {{
 *   baseName?: string,
 *   texSize?: number,
 *   binary?: boolean,
 *   save?: boolean
 * }} [opts]
 * @returns {Promise<{name:string, bytes:number, baked:number, skipped:number, blob:Blob}>}
 */
ExportGLTF.exportGLB = function (main, meshes, opts) {
  opts = opts || {};
  var baseName = opts.baseName || 'sculpt';
  var texSize = opts.texSize || 1024;
  var binary = opts.binary !== false;
  var doSave = opts.save !== false;

  if (!meshes || !meshes.length)
    return Promise.reject(new Error('No meshes to export'));

  var scene = new THREE.Scene();
  var baked = 0;
  var skipped = 0;
  var i;
  var jobs = [];

  for (i = 0; i < meshes.length; ++i) {
    if (meshHasUV(meshes[i])) baked++;
    else skipped++;
    jobs.push(ExportGLTF._meshToThree(main, meshes[i], texSize));
  }

  return Promise.all(jobs).then(function (threeMeshes) {
    for (i = 0; i < threeMeshes.length; ++i) {
      threeMeshes[i].name = 'mesh_' + i;
      scene.add(threeMeshes[i]);
    }

    var exporter = new GLTFExporter();
    return exporter.parseAsync(scene, {
      binary: binary,
      onlyVisible: false,
      truncateDrawRange: true
    }).then(function (result) {
      disposeObject3D(scene);

      var blob;
      var name;
      if (binary) {
        blob = new Blob([result], { type: 'model/gltf-binary' });
        name = baseName + '.glb';
      } else {
        blob = new Blob([JSON.stringify(result)], { type: 'model/gltf+json' });
        name = baseName + '.gltf';
      }

      if (doSave) saveAs(blob, name);

      return {
        name: name,
        bytes: blob.size,
        baked: baked,
        skipped: skipped,
        blob: blob
      };
    }, function (err) {
      disposeObject3D(scene);
      throw err;
    });
  });
};

export default ExportGLTF;
