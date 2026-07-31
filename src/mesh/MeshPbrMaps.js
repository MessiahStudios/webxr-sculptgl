/**
 * Live PBR texture slots on a sculpt mesh (albedo + packed metal-rough).
 * CPU canvases for paint/export; WebGL textures for ShaderPBR sampling.
 *
 * metalRough packing (glTF): R unused, G = roughness, B = metalness.
 */
import Utils from 'misc/Utils';

var MeshPbrMaps = {};

MeshPbrMaps.DEFAULT_SIZE = 1024;

function sRGBToLinear(c) {
  if (c <= 0.04045) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSRGB(c) {
  if (c <= 0.0031308) return 12.92 * c;
  return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
}

/**
 * @param {WebGLRenderingContext} gl
 * @param {HTMLCanvasElement} canvas
 * @param {boolean} sRGB
 * @returns {{canvas, ctx, texture, size, dirty, sRGB}}
 */
MeshPbrMaps._slotFromCanvas = function (gl, canvas, sRGB) {
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return {
    canvas: canvas,
    ctx: canvas.getContext('2d', { willReadFrequently: true }),
    texture: texture,
    size: canvas.width,
    dirty: false,
    sRGB: !!sRGB
  };
};

MeshPbrMaps.createBlank = function (gl, size, sRGB, fillRGBA) {
  size = size || MeshPbrMaps.DEFAULT_SIZE;
  fillRGBA = fillRGBA || [255, 255, 255, 255];
  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(' + fillRGBA[0] + ',' + fillRGBA[1] + ',' + fillRGBA[2] + ',' + (fillRGBA[3] / 255) + ')';
  ctx.fillRect(0, 0, size, size);
  return MeshPbrMaps._slotFromCanvas(gl, canvas, sRGB);
};

/**
 * Draw an HTMLImageElement / ImageBitmap / canvas into a new slot.
 */
MeshPbrMaps.fromImageSource = function (gl, source, sRGB, size) {
  size = size || MeshPbrMaps.DEFAULT_SIZE;
  var w = source.width || source.videoWidth || size;
  var h = source.height || source.videoHeight || size;
  var dim = Math.max(64, Math.min(2048, Math.max(w, h)));
  // Prefer power-of-two-ish square for paint math; keep source resolution when reasonable.
  if (w === h && w >= 64 && w <= 2048) dim = w;
  else dim = size;

  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = dim;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dim, dim);
  try {
    ctx.drawImage(source, 0, 0, dim, dim);
  } catch (err) {
    console.warn('MeshPbrMaps.fromImageSource draw failed', err);
  }
  return MeshPbrMaps._slotFromCanvas(gl, canvas, sRGB);
};

/**
 * Extract drawable image from a Three.js texture.
 */
MeshPbrMaps._threeImage = function (texture) {
  if (!texture) return null;
  var img = texture.image;
  if (!img) return null;
  if (img.data && img.width && img.height) {
    // DataTexture
    var c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    var ctx = c.getContext('2d');
    var id = ctx.createImageData(img.width, img.height);
    var src = img.data;
    var i;
    if (src.length === img.width * img.height * 4) {
      id.data.set(src);
    } else if (src.length === img.width * img.height * 3) {
      for (i = 0; i < img.width * img.height; ++i) {
        id.data[i * 4] = src[i * 3];
        id.data[i * 4 + 1] = src[i * 3 + 1];
        id.data[i * 4 + 2] = src[i * 3 + 2];
        id.data[i * 4 + 3] = 255;
      }
    } else {
      return null;
    }
    ctx.putImageData(id, 0, 0);
    return c;
  }
  return img;
};

MeshPbrMaps.fromThreeTexture = function (gl, texture, sRGB, size) {
  var src = MeshPbrMaps._threeImage(texture);
  if (!src) return null;
  return MeshPbrMaps.fromImageSource(gl, src, sRGB, size);
};

MeshPbrMaps.upload = function (gl, slot) {
  if (!slot || !slot.texture || !slot.canvas) return;
  gl.bindTexture(gl.TEXTURE_2D, slot.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, slot.canvas);
  gl.bindTexture(gl.TEXTURE_2D, null);
  slot.dirty = false;
};

MeshPbrMaps.releaseSlot = function (gl, slot) {
  if (!slot) return;
  if (slot.texture && gl) gl.deleteTexture(slot.texture);
  slot.texture = null;
  slot.canvas = null;
  slot.ctx = null;
};

MeshPbrMaps.clonePixels = function (slot) {
  if (!slot || !slot.ctx) return null;
  return slot.ctx.getImageData(0, 0, slot.size, slot.size);
};

MeshPbrMaps.restorePixels = function (gl, slot, imageData) {
  if (!slot || !slot.ctx || !imageData) return;
  slot.ctx.putImageData(imageData, 0, 0);
  MeshPbrMaps.upload(gl, slot);
};

/**
 * Attach albedo + metalRough slots from a Three MeshStandardMaterial.
 * @returns {{albedo, metalRough, factors}|null}
 */
MeshPbrMaps.fromThreeMaterial = function (gl, material, size) {
  if (!material || !gl) return null;
  size = size || MeshPbrMaps.DEFAULT_SIZE;

  var albedo = null;
  var map = material.map || null;
  if (map) albedo = MeshPbrMaps.fromThreeTexture(gl, map, true, size);
  if (!albedo) {
    var cr = 255;
    var cg = 255;
    var cb = 255;
    if (material.color && material.color.isColor) {
      // material.color is linear; canvas stores sRGB bytes for albedo sampling (shader does sRGBToLinear).
      cr = Math.round(Math.min(1, Math.max(0, linearToSRGB(material.color.r))) * 255);
      cg = Math.round(Math.min(1, Math.max(0, linearToSRGB(material.color.g))) * 255);
      cb = Math.round(Math.min(1, Math.max(0, linearToSRGB(material.color.b))) * 255);
    }
    albedo = MeshPbrMaps.createBlank(gl, size, true, [cr, cg, cb, 255]);
  }

  var metalRough = null;
  var mrMap = material.metalnessMap || material.roughnessMap || null;
  // Prefer combined metallicRoughnessMap if Three exposed it as same ref.
  if (material.metalnessMap && material.roughnessMap && material.metalnessMap === material.roughnessMap)
    mrMap = material.metalnessMap;
  else if (material.metalnessMap)
    mrMap = material.metalnessMap;
  else if (material.roughnessMap)
    mrMap = material.roughnessMap;

  var roughF = (typeof material.roughness === 'number') ? material.roughness : 1.0;
  var metalF = (typeof material.metalness === 'number') ? material.metalness : 1.0;

  if (mrMap) {
    metalRough = MeshPbrMaps.fromThreeTexture(gl, mrMap, false, size);
  }
  if (!metalRough) {
    var g = Math.round(Math.min(1, Math.max(0, roughF)) * 255);
    var b = Math.round(Math.min(1, Math.max(0, metalF)) * 255);
    metalRough = MeshPbrMaps.createBlank(gl, size, false, [255, g, b, 255]);
    // Factors already baked into solid color — keep multipliers at 1.
    roughF = 1.0;
    metalF = 1.0;
  }

  return {
    albedo: albedo,
    metalRough: metalRough,
    factors: {
      roughness: roughF,
      metalness: metalF
    }
  };
};

/**
 * Ensure UV mesh has editable map slots (blank or from existing).
 */
MeshPbrMaps.ensureOnMesh = function (mesh, size) {
  if (!mesh || !mesh.hasUV || !mesh.hasUV()) return false;
  if (mesh.hasPbrMaps && mesh.hasPbrMaps()) return true;
  var gl = mesh.getGL();
  size = size || MeshPbrMaps.DEFAULT_SIZE;
  var albedo = MeshPbrMaps.createBlank(gl, size, true, [255, 255, 255, 255]);
  // Default clay-ish rough/metal matching typical verts
  var metalRough = MeshPbrMaps.createBlank(gl, size, false, [255, 46, 20, 255]);
  mesh.setPbrMaps(albedo, metalRough, { roughness: 1.0, metalness: 1.0 });
  // Seed albedo canvas from vertex colors (nearest UV) so paint-over starts from current look.
  MeshPbrMaps.seedFromVertices(mesh);
  return true;
};

MeshPbrMaps.seedFromVertices = function (mesh) {
  var albedo = mesh.getAlbedoMapSlot && mesh.getAlbedoMapSlot();
  var mr = mesh.getMetalRoughMapSlot && mesh.getMetalRoughMapSlot();
  if (!albedo || !albedo.ctx || !mesh.hasUV()) return;

  var uvAr = mesh.getTexCoords();
  var fAr = mesh.getFaces();
  var fArUV = mesh.getFacesTexCoord();
  var cAr = mesh.getColors();
  var mAr = mesh.getMaterials();
  var nbFaces = mesh.getNbFaces();
  var size = albedo.size;
  var aCtx = albedo.ctx;
  var mCtx = mr && mr.ctx;
  var aImg = aCtx.getImageData(0, 0, size, size);
  var mImg = mCtx ? mCtx.getImageData(0, 0, size, size) : null;
  var ad = aImg.data;
  var md = mImg && mImg.data;

  var stamp = function (uvi, vi) {
    var u = uvAr[uvi * 2];
    var v = uvAr[uvi * 2 + 1];
    u = u - Math.floor(u);
    v = v - Math.floor(v);
    if (u < 0) u += 1;
    if (v < 0) v += 1;
    var x = Math.min(size - 1, Math.max(0, (u * size) | 0));
    // Canvas Y is top-down; glTF UV origin is bottom-left — PaintUV flips Y, match that.
    var y = Math.min(size - 1, Math.max(0, ((1.0 - v) * size) | 0));
    var o = (y * size + x) * 4;
    var j = vi * 3;
    ad[o] = Math.round(Math.min(1, Math.max(0, cAr[j])) * 255);
    ad[o + 1] = Math.round(Math.min(1, Math.max(0, cAr[j + 1])) * 255);
    ad[o + 2] = Math.round(Math.min(1, Math.max(0, cAr[j + 2])) * 255);
    ad[o + 3] = 255;
    if (md) {
      md[o] = 255;
      md[o + 1] = Math.round(Math.min(1, Math.max(0, mAr[j])) * 255);
      md[o + 2] = Math.round(Math.min(1, Math.max(0, mAr[j + 1])) * 255);
      md[o + 3] = 255;
    }
  };

  var i;
  for (i = 0; i < nbFaces; ++i) {
    var id = i * 4;
    stamp(fArUV[id], fAr[id]);
    stamp(fArUV[id + 1], fAr[id + 1]);
    stamp(fArUV[id + 2], fAr[id + 2]);
    if (fAr[id + 3] !== Utils.TRI_INDEX) stamp(fArUV[id + 3], fAr[id + 3]);
  }

  aCtx.putImageData(aImg, 0, 0);
  if (mCtx && mImg) mCtx.putImageData(mImg, 0, 0);
  MeshPbrMaps.upload(mesh.getGL(), albedo);
  if (mr) MeshPbrMaps.upload(mesh.getGL(), mr);
};

/**
 * Paint a soft circle into map slot(s) at UV, fallOff in [0,1].
 */
MeshPbrMaps.splatUV = function (mesh, u, v, radiusUV, fallOff, color, roughness, metallic, writeA, writeR, writeM) {
  if (!mesh.hasPbrMaps || !mesh.hasPbrMaps()) return;
  var albedo = mesh.getAlbedoMapSlot();
  var mr = mesh.getMetalRoughMapSlot();
  var size = albedo.size;
  var rad = Math.max(1, (radiusUV * size) | 0);
  u = u - Math.floor(u);
  v = v - Math.floor(v);
  if (u < 0) u += 1;
  if (v < 0) v += 1;
  var cx = (u * size) | 0;
  var cy = ((1.0 - v) * size) | 0;

  var aCtx = albedo.ctx;
  var mCtx = mr && mr.ctx;
  var x0 = Math.max(0, cx - rad);
  var y0 = Math.max(0, cy - rad);
  var x1 = Math.min(size - 1, cx + rad);
  var y1 = Math.min(size - 1, cy + rad);
  var w = x1 - x0 + 1;
  var h = y1 - y0 + 1;
  if (w < 1 || h < 1) return;

  var aImg = aCtx.getImageData(x0, y0, w, h);
  var mImg = mCtx ? mCtx.getImageData(x0, y0, w, h) : null;
  var ad = aImg.data;
  var md = mImg && mImg.data;
  var tr = Math.round(color[0] * 255);
  var tg = Math.round(color[1] * 255);
  var tb = Math.round(color[2] * 255);
  var roughB = Math.round(roughness * 255);
  var metalB = Math.round(metallic * 255);
  var rad2 = rad * rad || 1;
  var yy;
  var xx;
  for (yy = 0; yy < h; ++yy) {
    for (xx = 0; xx < w; ++xx) {
      var dx = (x0 + xx) - cx;
      var dy = (y0 + yy) - cy;
      var d2 = dx * dx + dy * dy;
      if (d2 > rad2) continue;
      var dist = Math.sqrt(d2) / rad;
      var f = fallOff * (1.0 - dist);
      if (f <= 0.001) continue;
      var o = (yy * w + xx) * 4;
      var fc = 1.0 - f;
      if (writeA) {
        ad[o] = (ad[o] * fc + tr * f) | 0;
        ad[o + 1] = (ad[o + 1] * fc + tg * f) | 0;
        ad[o + 2] = (ad[o + 2] * fc + tb * f) | 0;
        ad[o + 3] = 255;
      }
      if (md && (writeR || writeM)) {
        if (writeR) md[o + 1] = (md[o + 1] * fc + roughB * f) | 0;
        if (writeM) md[o + 2] = (md[o + 2] * fc + metalB * f) | 0;
        md[o + 3] = 255;
      }
    }
  }
  aCtx.putImageData(aImg, x0, y0);
  if (mCtx && mImg) mCtx.putImageData(mImg, x0, y0);
  albedo.dirty = true;
  if (mr) mr.dirty = true;
};

MeshPbrMaps.flush = function (mesh) {
  if (!mesh || !mesh.hasPbrMaps || !mesh.hasPbrMaps()) return;
  var gl = mesh.getGL();
  var albedo = mesh.getAlbedoMapSlot();
  var mr = mesh.getMetalRoughMapSlot();
  if (albedo && albedo.dirty) MeshPbrMaps.upload(gl, albedo);
  if (mr && mr.dirty) MeshPbrMaps.upload(gl, mr);
};

MeshPbrMaps.toBlob = function (slot, mime) {
  return new Promise(function (resolve, reject) {
    if (!slot || !slot.canvas) {
      reject(new Error('No map slot'));
      return;
    }
    slot.canvas.toBlob(function (blob) {
      if (!blob) reject(new Error('toBlob failed'));
      else resolve(blob);
    }, mime || 'image/png');
  });
};

/**
 * Build separate rough/metal PNG blobs from packed metalRough slot (for OBJ+MAPS).
 */
MeshPbrMaps.splitMetalRoughBlobs = function (slot) {
  if (!slot || !slot.ctx) return Promise.reject(new Error('No MR slot'));
  var size = slot.size;
  var src = slot.ctx.getImageData(0, 0, size, size);
  var rCanvas = document.createElement('canvas');
  var mCanvas = document.createElement('canvas');
  rCanvas.width = mCanvas.width = size;
  rCanvas.height = mCanvas.height = size;
  var rCtx = rCanvas.getContext('2d');
  var mCtx = mCanvas.getContext('2d');
  var rImg = rCtx.createImageData(size, size);
  var mImg = mCtx.createImageData(size, size);
  var i;
  for (i = 0; i < size * size; ++i) {
    var o = i * 4;
    var g = src.data[o + 1];
    var b = src.data[o + 2];
    rImg.data[o] = rImg.data[o + 1] = rImg.data[o + 2] = g;
    rImg.data[o + 3] = 255;
    mImg.data[o] = mImg.data[o + 1] = mImg.data[o + 2] = b;
    mImg.data[o + 3] = 255;
  }
  rCtx.putImageData(rImg, 0, 0);
  mCtx.putImageData(mImg, 0, 0);
  return Promise.all([
    new Promise(function (res, rej) { rCanvas.toBlob(function (b) { b ? res(b) : rej(new Error('rough blob')); }, 'image/png'); }),
    new Promise(function (res, rej) { mCanvas.toBlob(function (b) { b ? res(b) : rej(new Error('metal blob')); }, 'image/png'); })
  ]).then(function (pair) {
    return { roughness: pair[0], metalness: pair[1] };
  });
};

MeshPbrMaps.sampleAlbedoSRGB = function (mesh, u, v, out) {
  var slot = mesh.getAlbedoMapSlot && mesh.getAlbedoMapSlot();
  if (!slot || !slot.ctx) return null;
  var size = slot.size;
  u = u - Math.floor(u);
  v = v - Math.floor(v);
  if (u < 0) u += 1;
  if (v < 0) v += 1;
  var x = Math.min(size - 1, Math.max(0, (u * size) | 0));
  var y = Math.min(size - 1, Math.max(0, ((1.0 - v) * size) | 0));
  var d = slot.ctx.getImageData(x, y, 1, 1).data;
  out[0] = d[0] / 255;
  out[1] = d[1] / 255;
  out[2] = d[2] / 255;
  return out;
};

MeshPbrMaps.sampleMetalRough = function (mesh, u, v, out) {
  var slot = mesh.getMetalRoughMapSlot && mesh.getMetalRoughMapSlot();
  if (!slot || !slot.ctx) return null;
  var size = slot.size;
  u = u - Math.floor(u);
  v = v - Math.floor(v);
  if (u < 0) u += 1;
  if (v < 0) v += 1;
  var x = Math.min(size - 1, Math.max(0, (u * size) | 0));
  var y = Math.min(size - 1, Math.max(0, ((1.0 - v) * size) | 0));
  var d = slot.ctx.getImageData(x, y, 1, 1).data;
  var factors = mesh.getPbrMapFactors ? mesh.getPbrMapFactors() : { roughness: 1, metalness: 1 };
  out[0] = (d[1] / 255) * (factors.roughness != null ? factors.roughness : 1);
  out[1] = (d[2] / 255) * (factors.metalness != null ? factors.metalness : 1);
  return out;
};

export default MeshPbrMaps;
