/**
 * Bake vertex paint (color / roughness / metalness) into UV-space PNG blobs.
 * Shared by desktop Files UI and XR OBJ+maps export.
 */
import Rtt from 'drawables/Rtt';
import ShaderPaintUV from 'render/shaders/ShaderPaintUV';
import ShaderBlur from 'render/shaders/ShaderBlur';
import Enums from 'misc/Enums';

var BakeVertexMaps = {};
var _rttPaint = null;
var _rttBlur = null;

BakeVertexMaps._getRttPaint = function (gl) {
  if (!_rttPaint) {
    _rttPaint = new Rtt(gl, Enums.Shader.PAINTUV, null);
    _rttPaint.setWrapRepeat(true);
    _rttPaint.setFilterNearest(true);
    ShaderBlur.INPUT_TEXTURE = _rttPaint;
  }
  return _rttPaint;
};

BakeVertexMaps._getRttBlur = function (gl) {
  if (!_rttBlur)
    _rttBlur = new Rtt(gl, Enums.Shader.BLUR, null);
  return _rttBlur;
};

BakeVertexMaps._extractCanvas = function (gl, width, height) {
  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  var pixels = new Uint8Array(4 * width * height);
  var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.error('BakeVertexMaps: FRAMEBUFFER not complete');
    return canvas;
  }
  gl.flush();
  gl.finish();
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  var ctx = canvas.getContext('2d');
  var imageData = ctx.getImageData(0, 0, width, height);
  imageData.data.set(pixels);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

BakeVertexMaps._blur = function (gl, main, width, height) {
  var rttBlur = BakeVertexMaps._getRttBlur(gl);
  rttBlur.onResize(width, height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, rttBlur.getFramebuffer());
  gl.clear(gl.COLOR_BUFFER_BIT);
  rttBlur.render(main);
};

/**
 * @param {*} main Scene / SculptGL
 * @param {*} mesh mesh with UVs
 * @param {number} size texture edge length
 * @param {0|1|2} channel 0=diffuse 1=roughness 2=metalness
 * @returns {Promise<Blob>}
 */
BakeVertexMaps.bakeChannel = function (main, mesh, size, channel) {
  return new Promise(function (resolve, reject) {
    try {
      if (!mesh || !mesh.getTexCoords || !mesh.getTexCoords()) {
        reject(new Error('Mesh has no UV'));
        return;
      }
      var gl = mesh.getGL();
      var width = size | 0;
      var height = size | 0;
      if (width < 64) width = height = 1024;

      ShaderPaintUV.CHANNEL_VALUE = channel | 0;
      var tmpShaderType = mesh.getShaderType();
      mesh.setShaderType(Enums.Shader.PAINTUV);

      var rttPaint = BakeVertexMaps._getRttPaint(gl);
      rttPaint.onResize(width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, rttPaint.getFramebuffer());
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.viewport(0, 0, width, height);
      mesh.render();
      mesh.setShaderType(tmpShaderType);

      BakeVertexMaps._blur(gl, main, width, height);
      var canvas = BakeVertexMaps._extractCanvas(gl, width, height);
      if (main.onCanvasResize) main.onCanvasResize();

      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error('toBlob failed'));
        else resolve(blob);
      }, 'image/png');
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Bake diffuse + roughness + metalness for one mesh.
 * @returns {Promise<{diffuse:Blob, roughness:Blob, metalness:Blob}>}
 */
BakeVertexMaps.bakeAll = function (main, mesh, size) {
  return BakeVertexMaps.bakeChannel(main, mesh, size, 0).then(function (diffuse) {
    return BakeVertexMaps.bakeChannel(main, mesh, size, 1).then(function (roughness) {
      return BakeVertexMaps.bakeChannel(main, mesh, size, 2).then(function (metalness) {
        return { diffuse: diffuse, roughness: roughness, metalness: metalness };
      });
    });
  });
};

export default BakeVertexMaps;
