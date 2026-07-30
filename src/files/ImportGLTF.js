/**
 * Import glTF / GLB into MeshStatic.
 *
 * Keeps indexed topology (welded verts), UVs, vertex colors, and bakes
 * MeshStandardMaterial baseColor (+ optional map) and metal/rough factors
 * into SculptGL's vertex paint buffers. Draco-compressed meshes decode when
 * the decoder assets under ./draco/ are present.
 *
 * Coordinates: glTF + Three + SculptGL + WebXR share right-handed **Y-up**.
 * World matrices bake into vertex positions as-is (no axis remap).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import Utils from 'misc/Utils';
import MeshStatic from 'mesh/meshStatic/MeshStatic';

var Import = {};
var _dracoLoader = null;

Import._getDracoLoader = function () {
  if (_dracoLoader) return _dracoLoader;
  try {
    _dracoLoader = new DRACOLoader();
    // Copied by webpack to app/draco/ (gltf-tuned wasm/js).
    _dracoLoader.setDecoderPath('./draco/');
  } catch (err) {
    console.warn('ImportGLTF: DRACOLoader init failed', err);
    _dracoLoader = null;
  }
  return _dracoLoader;
};

/**
 * @param {ArrayBuffer|string} data
 * @param {WebGLRenderingContext} gl
 * @returns {Promise<MeshStatic[]>}
 */
Import.importGLTF = function (data, gl) {
  return new Promise(function (resolve, reject) {
    if (!data) {
      reject(new Error('Empty glTF data'));
      return;
    }
    var loader = new GLTFLoader();
    var draco = Import._getDracoLoader();
    if (draco) loader.setDRACOLoader(draco);

    loader.parse(
      data,
      '',
      function (gltf) {
        try {
          var out = [];
          if (!gltf || !gltf.scene) {
            resolve(out);
            return;
          }
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse(function (obj) {
            if (!obj.isMesh || !obj.geometry) return;
            var mats = obj.material;
            var geo = obj.geometry;
            var groups = geo.groups;
            if (Array.isArray(mats) && groups && groups.length) {
              var g;
              for (g = 0; g < groups.length; ++g) {
                var mi = groups[g].materialIndex || 0;
                var meshG = Import._meshFromThreeGeometry(
                  geo, obj.matrixWorld, gl, mats[mi] || mats[0], groups[g]
                );
                if (meshG) out.push(meshG);
              }
            } else {
              var mat = Array.isArray(mats) ? mats[0] : mats;
              var mesh = Import._meshFromThreeGeometry(geo, obj.matrixWorld, gl, mat, null);
              if (mesh) out.push(mesh);
            }
          });
          resolve(out);
        } catch (err) {
          reject(err);
        }
      },
      function (err) {
        reject(err || new Error('GLTFLoader.parse failed'));
      }
    );
  });
};

/**
 * Convert a Three BufferGeometry (+ world matrix + material) into MeshStatic.
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Matrix4} matrixWorld
 * @param {WebGLRenderingContext} gl
 * @param {THREE.Material} [material]
 * @param {{start:number,count:number}|null} [group] optional draw-range into the index/non-index stream
 * @returns {MeshStatic|null}
 */
Import._meshFromThreeGeometry = function (geometry, matrixWorld, gl, material, group) {
  var pos = geometry.attributes && geometry.attributes.position;
  if (!pos || !pos.count) return null;

  var index = geometry.index;
  var uvAttr = geometry.attributes && geometry.attributes.uv;
  var colAttr = geometry.attributes && geometry.attributes.color;

  var iStart = 0;
  var iCount;
  if (group) {
    iStart = group.start | 0;
    iCount = group.count | 0;
  } else if (index) {
    iCount = index.count;
  } else {
    iCount = pos.count;
  }
  if (iCount < 3) return null;

  var corners = new Uint32Array(iCount);
  var i;
  if (index) {
    for (i = 0; i < iCount; ++i)
      corners[i] = index.getX(iStart + i);
  } else {
    for (i = 0; i < iCount; ++i)
      corners[i] = iStart + i;
  }

  var nbFaces = (iCount / 3) | 0;
  if (nbFaces < 1) return null;

  // Compact unused verts when extracting a material group from a shared buffer.
  var remap = null;
  var used = null;
  var nb;
  if (group) {
    remap = new Int32Array(pos.count);
    for (i = 0; i < pos.count; ++i) remap[i] = -1;
    used = [];
    for (i = 0; i < iCount; ++i) {
      var vi = corners[i];
      if (remap[vi] < 0) {
        remap[vi] = used.length;
        used.push(vi);
      }
    }
    nb = used.length;
  } else {
    nb = pos.count;
  }
  if (nb < 3) return null;

  var vAr = new Float32Array(nb * 3);
  var v = new THREE.Vector3();
  var mat = matrixWorld || new THREE.Matrix4();
  for (i = 0; i < nb; ++i) {
    var src = used ? used[i] : i;
    v.fromBufferAttribute(pos, src);
    v.applyMatrix4(mat);
    vAr[i * 3] = v.x;
    vAr[i * 3 + 1] = v.y;
    vAr[i * 3 + 2] = v.z;
  }

  var fAr = new Uint32Array(nbFaces * 4);
  for (i = 0; i < nbFaces; ++i) {
    var id = i * 4;
    var ic = i * 3;
    var a = corners[ic];
    var b = corners[ic + 1];
    var c = corners[ic + 2];
    fAr[id] = remap ? remap[a] : a;
    fAr[id + 1] = remap ? remap[b] : b;
    fAr[id + 2] = remap ? remap[c] : c;
    fAr[id + 3] = Utils.TRI_INDEX;
  }

  var mesh = new MeshStatic(gl);
  mesh.setVertices(vAr);
  mesh.setFaces(fAr);

  // UVs — 1:1 with position verts after GLTFLoader (seams already duplicated).
  if (uvAttr && uvAttr.count === pos.count) {
    var texAr = new Float32Array(nb * 2);
    for (i = 0; i < nb; ++i) {
      var uSrc = used ? used[i] : i;
      texAr[i * 2] = uvAttr.getX(uSrc);
      texAr[i * 2 + 1] = uvAttr.getY(uSrc);
    }
    // Face UV indices match vertex indices when UVs are per-vertex.
    mesh.initTexCoordsDataFromOBJData(texAr, fAr.slice());
  }

  // Colors: COLOR_0 wins; else bake material baseColor (+ map when UVs exist).
  // Vertex buffers are sRGB (ShaderPBR applies sRGBToLinear).
  var cAr = null;
  if (colAttr && colAttr.count === pos.count) {
    cAr = new Float32Array(nb * 3);
    var itemSize = colAttr.itemSize || 3;
    for (i = 0; i < nb; ++i) {
      var cSrc = used ? used[i] : i;
      cAr[i * 3] = Import._linearToSRGB(colAttr.getX(cSrc));
      cAr[i * 3 + 1] = Import._linearToSRGB(colAttr.getY(cSrc));
      cAr[i * 3 + 2] = Import._linearToSRGB(itemSize > 2 ? colAttr.getZ(cSrc) : colAttr.getY(cSrc));
    }
  } else {
    cAr = Import._bakeVertexColors(material, uvAttr, pos.count, nb, used);
  }
  if (cAr) mesh.setColors(cAr);

  var mAr = Import._bakeVertexMaterials(material, nb);
  if (mAr) mesh.setMaterials(mAr);

  return mesh;
};

/**
 * Fill vertex RGB (sRGB, matching ShaderPBR's sRGBToLinear(aColor)) from
 * material.color × optional baseColorTexture samples.
 * @returns {Float32Array|null}
 */
Import._bakeVertexColors = function (material, uvAttr, posCount, nb, used) {
  if (!material) return null;
  var hasColor = material.color && material.color.isColor;
  var map = material.map || null;
  if (!hasColor && !map) return null;

  // Three stores material.color in linear; sculpt vertex colors are sRGB.
  var lr = hasColor ? material.color.r : 1.0;
  var lg = hasColor ? material.color.g : 1.0;
  var lb = hasColor ? material.color.b : 1.0;

  var cAr = new Float32Array(nb * 3);
  var canSample = !!(map && uvAttr && uvAttr.count === posCount);
  var i;
  for (i = 0; i < nb; ++i) {
    var r = lr;
    var g = lg;
    var b = lb;
    if (canSample) {
      var uSrc = used ? used[i] : i;
      var sample = Import._sampleTextureLinear(map, uvAttr.getX(uSrc), uvAttr.getY(uSrc));
      if (sample) {
        r *= sample[0];
        g *= sample[1];
        b *= sample[2];
      }
    }
    cAr[i * 3] = Import._linearToSRGB(r);
    cAr[i * 3 + 1] = Import._linearToSRGB(g);
    cAr[i * 3 + 2] = Import._linearToSRGB(b);
  }
  return cAr;
};

Import._linearToSRGB = function (c) {
  if (c <= 0.0031308) return 12.92 * c;
  return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
};

Import._sRGBToLinear = function (c) {
  if (c <= 0.04045) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
};

/**
 * roughness / metalness / mask per vertex from MeshStandardMaterial factors.
 * @returns {Float32Array|null}
 */
Import._bakeVertexMaterials = function (material, nb) {
  if (!material) return null;
  var rough = (typeof material.roughness === 'number') ? material.roughness : null;
  var metal = (typeof material.metalness === 'number') ? material.metalness : null;
  if (rough == null && metal == null) return null;
  if (rough == null) rough = 0.18;
  if (metal == null) metal = 0.08;

  var mAr = new Float32Array(nb * 3);
  var i;
  for (i = 0; i < nb; ++i) {
    var j = i * 3;
    mAr[j] = rough;
    mAr[j + 1] = metal;
    mAr[j + 2] = 1.0;
  }
  return mAr;
};

/**
 * Sample a Three texture at UV into linear RGB [0,1].
 * Caches ImageData on texture.userData for repeated verts.
 * @returns {[number,number,number]|null}
 */
Import._sampleTextureLinear = function (texture, u, v) {
  try {
    var img = texture && texture.image;
    if (!img) return null;
    var w = img.width || img.videoWidth || 0;
    var h = img.height || img.videoHeight || 0;
    if (!w || !h) return null;

    var cache = texture.userData && texture.userData._sculptSample;
    if (!cache) {
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      cache = {
        data: ctx.getImageData(0, 0, w, h).data,
        w: w,
        h: h
      };
      if (!texture.userData) texture.userData = {};
      texture.userData._sculptSample = cache;
    }

    var uu = u - Math.floor(u);
    var vv = v - Math.floor(v);
    if (uu < 0) uu += 1;
    if (vv < 0) vv += 1;
    // glTF color maps usually flipY=false (UV origin top-left, same as canvas).
    var yu = texture.flipY ? (1.0 - vv) : vv;
    var x = Math.min(cache.w - 1, Math.max(0, (uu * cache.w) | 0));
    var y = Math.min(cache.h - 1, Math.max(0, (yu * cache.h) | 0));
    var o = (y * cache.w + x) * 4;
    return [
      Import._sRGBToLinear(cache.data[o] / 255),
      Import._sRGBToLinear(cache.data[o + 1] / 255),
      Import._sRGBToLinear(cache.data[o + 2] / 255)
    ];
  } catch (err) {
    return null;
  }
};

export default Import;
