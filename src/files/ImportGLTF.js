/**
 * Import glTF / GLB into MeshStatic (geometry-first).
 * Uses Three.js GLTFLoader already pulled in for XR controller models.
 *
 * Coordinates: glTF + Three + SculptGL + WebXR share right-handed **Y-up**
 * (X right, Y up, Z toward viewer in a typical OpenGL view). We bake each
 * node's world matrix as-is — no Z-up / XZY remap — so orientation matches
 * the sculpt scene and XR stage. Size matching is Scene._autoMatrix
 * (normalizeAndCenterMeshes), not an axis swap.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import Utils from 'misc/Utils';
import MeshStatic from 'mesh/meshStatic/MeshStatic';

var Import = {};

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
          // World matrices already in Three/glTF Y-up; bake into vertex positions.
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse(function (obj) {
            if (!obj.isMesh || !obj.geometry) return;
            var mesh = Import._meshFromThreeGeometry(obj.geometry, obj.matrixWorld, gl);
            if (mesh) out.push(mesh);
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
 * Convert a Three BufferGeometry (+ world matrix) into a SculptGL MeshStatic.
 * Positions stay XYZ in the same Y-up frame (no axis permutation).
 * @returns {MeshStatic|null}
 */
Import._meshFromThreeGeometry = function (geometry, matrixWorld, gl) {
  var geo = geometry.index ? geometry.toNonIndexed() : geometry;
  var pos = geo.attributes && geo.attributes.position;
  if (!pos || !pos.count) return null;

  var nb = pos.count;
  if (nb < 3) return null;

  var vAr = new Float32Array(nb * 3);
  var i;
  var v = new THREE.Vector3();
  var mat = matrixWorld || new THREE.Matrix4();

  for (i = 0; i < nb; ++i) {
    v.fromBufferAttribute(pos, i);
    v.applyMatrix4(mat);
    // Keep XYZ order — matches SculptGL mesh buffers and gizmo axes.
    vAr[i * 3] = v.x;
    vAr[i * 3 + 1] = v.y;
    vAr[i * 3 + 2] = v.z;
  }

  var nbFaces = (nb / 3) | 0;
  if (nbFaces < 1) return null;
  var fAr = new Uint32Array(nbFaces * 4);
  for (i = 0; i < nbFaces; ++i) {
    var id = i * 4;
    var iv = i * 3;
    fAr[id] = iv;
    fAr[id + 1] = iv + 1;
    fAr[id + 2] = iv + 2;
    fAr[id + 3] = Utils.TRI_INDEX;
  }

  var mesh = new MeshStatic(gl);
  mesh.setVertices(vAr);
  mesh.setFaces(fAr);

  var col = geo.attributes && geo.attributes.color;
  if (col && col.count === nb) {
    var cAr = new Float32Array(nb * 3);
    var itemSize = col.itemSize || 3;
    for (i = 0; i < nb; ++i) {
      cAr[i * 3] = col.getX(i);
      cAr[i * 3 + 1] = col.getY(i);
      cAr[i * 3 + 2] = itemSize > 2 ? col.getZ(i) : col.getY(i);
    }
    mesh.setColors(cAr);
  }

  return mesh;
};

export default Import;
