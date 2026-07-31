import { vec3 } from 'gl-matrix';
import Tablet from 'misc/Tablet';
import SculptBase from 'editing/tools/SculptBase';
import MeshPbrMaps from 'mesh/MeshPbrMaps';
import Enums from 'misc/Enums';
import Utils from 'misc/Utils';

class Paint extends SculptBase {

  constructor(main) {
    super(main);

    this._radius = 50;
    this._hardness = 0.75;
    this._intensity = 0.75;
    this._culling = false;
    this._color = vec3.fromValues(1.0, 0.766, 0.336); // albedo
    this._material = vec3.fromValues(0.3, 0.95, 0.0); // roughness/metallic/masking
    this._pickColor = false; // color picking
    this._pickCallback = null; // callback function after picking a color
    this._idAlpha = 0;
    this._lockPosition = false;

    this._writeAlbedo = true;
    this._writeRoughness = true;
    this._writeMetalness = true;
  }

  end() {
    // Leave _pickColor to the UI (desktop checkbox / XR eyedropper opt).
    var mesh = this.getMesh();
    if (mesh && mesh.hasPbrMaps && mesh.hasPbrMaps())
      MeshPbrMaps.flush(mesh);
    SculptBase.prototype.end.call(this);
  }

  /**
   * XR: sample surface color instead of painting while eyedropper is on.
   */
  startXR() {
    if (this._pickColor) {
      var picking = this._main.getPicking();
      if (!picking.getMesh())
        return false;
      this.pickColor(picking);
      return true;
    }
    return SculptBase.prototype.startXR.call(this);
  }

  updateXR() {
    if (this._pickColor) {
      this.updatePickColor();
      return;
    }
    SculptBase.prototype.updateXR.call(this);
  }

  pushState(force) {
    if (!this._pickColor || force)
      this._main.getStateManager().pushStateColorAndMaterial(this.getMesh());
  }

  startSculpt() {
    if (this._pickColor)
      return this.pickColor(this._main.getPicking());
    var mesh = this.getMesh();
    // UV mesh without maps yet: create editable slots so paint overwrites texture detail.
    if (mesh && mesh.hasUV() && !(mesh.hasPbrMaps && mesh.hasPbrMaps())) {
      MeshPbrMaps.ensureOnMesh(mesh, MeshPbrMaps.DEFAULT_SIZE);
      mesh.setShaderType(Enums.Shader.PBR);
    }
    super.startSculpt();
  }

  update(contin) {
    if (this._pickColor === true)
      return this.updatePickColor();
    super.update(contin);
  }

  updateContinuous() {
    if (this._pickColor === true)
      return this.updatePickColor();
    super.updateContinuous();
  }

  updateMeshBuffers() {
    var mesh = this.getMesh();
    if (mesh.isDynamic) {
      mesh.updateBuffers();
    } else {
      mesh.updateColorBuffer();
      mesh.updateMaterialBuffer();
    }
    if (mesh.hasPbrMaps && mesh.hasPbrMaps())
      MeshPbrMaps.flush(mesh);
  }

  updatePickColor() {
    var picking = this._main.getPicking();
    if (picking.intersectionMouseMesh())
      this.pickColor(picking);
  }

  setPickCallback(cb) {
    this._pickCallback = cb;
  }

  /** Inverse-distance UV lerp on the picked face (matches polyLerp weights). */
  _lerpUV(picking, out) {
    var mesh = picking.getMesh();
    if (!mesh || !mesh.hasUV()) return null;
    var uvAr = mesh.getTexCoords();
    var fAr = mesh.getFaces();
    var fArUV = mesh.getFacesTexCoord();
    var vAr = mesh.getVertices();
    var id = picking.getPickedFace() * 4;
    if (id < 0) return null;

    var iv = [fAr[id], fAr[id + 1], fAr[id + 2]];
    var iuv = [fArUV[id], fArUV[id + 1], fArUV[id + 2]];
    var isQuad = fAr[id + 3] !== Utils.TRI_INDEX;
    if (isQuad) {
      iv.push(fAr[id + 3]);
      iuv.push(fArUV[id + 3]);
    }

    var inter = picking.getIntersectionPoint();
    var sum = 0;
    var weights = [];
    var k;
    for (k = 0; k < iv.length; ++k) {
      var j = iv[k] * 3;
      var dx = inter[0] - vAr[j];
      var dy = inter[1] - vAr[j + 1];
      var dz = inter[2] - vAr[j + 2];
      var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var w = len > 1e-8 ? 1.0 / len : 1e8;
      weights.push(w);
      sum += w;
    }
    out[0] = 0;
    out[1] = 0;
    for (k = 0; k < iv.length; ++k) {
      var tw = weights[k] / sum;
      out[0] += uvAr[iuv[k] * 2] * tw;
      out[1] += uvAr[iuv[k] * 2 + 1] * tw;
    }
    return out;
  }

  pickColor(picking) {
    var mesh = this.getMesh();
    var color = this._color;
    var roughness;
    var metallic;
    var uv = [0, 0];
    if (mesh.hasPbrMaps && mesh.hasPbrMaps() && this._lerpUV(picking, uv)) {
      MeshPbrMaps.sampleAlbedoSRGB(mesh, uv[0], uv[1], color);
      var mr = [0, 0];
      MeshPbrMaps.sampleMetalRough(mesh, uv[0], uv[1], mr);
      roughness = mr[0];
      metallic = mr[1];
    } else {
      picking.polyLerp(mesh.getMaterials(), color);
      roughness = color[0];
      metallic = color[1];
      picking.polyLerp(mesh.getColors(), color);
    }
    this._pickCallback(color, roughness, metallic);
  }

  stroke(picking) {
    var iVertsInRadius = picking.getPickedVertices();
    var intensity = this._intensity * Tablet.getPressureIntensity();

    // undo-redo
    this._main.getStateManager().pushVertices(iVertsInRadius);
    iVertsInRadius = this.dynamicTopology(picking);

    if (this._culling)
      iVertsInRadius = this.getFrontVertices(iVertsInRadius, picking.getEyeDirection());

    picking.updateAlpha(this._lockPosition);
    picking.setIdAlpha(this._idAlpha);
    this.paint(iVertsInRadius, picking.getIntersectionPoint(), picking.getLocalRadius2(), intensity, this._hardness, picking);

    var mesh = this.getMesh();
    mesh.updateDuplicateColorsAndMaterials(iVertsInRadius);
    if (mesh.isUsingDrawArrays())
      mesh.updateDrawArrays(mesh.getFacesFromVertices(iVertsInRadius));
  }

  paint(iVerts, center, radiusSquared, intensity, hardness, picking) {
    var mesh = this.getMesh();
    var vAr = mesh.getVertices();
    var cAr = mesh.getColors();
    var mAr = mesh.getMaterials();
    var color = this._color;
    var roughness = this._material[0];
    var metallic = this._material[1];
    var radius = Math.sqrt(radiusSquared);
    var cr = color[0];
    var cg = color[1];
    var cb = color[2];
    var cx = center[0];
    var cy = center[1];
    var cz = center[2];
    var softness = 2 * (1 - hardness);
    var paintMaps = mesh.hasPbrMaps && mesh.hasPbrMaps();
    var uvAr = paintMaps ? mesh.getTexCoords() : null;
    var nbUnique = mesh.getNbVertices();

    // Approximate UV brush radius from a few verts near the hit.
    var radiusUV = 0.02;
    if (paintMaps && iVerts.length > 1 && uvAr) {
      var u0 = uvAr[iVerts[0] * 2];
      var v0 = uvAr[iVerts[0] * 2 + 1];
      var maxUV = 0;
      var sampleN = Math.min(8, iVerts.length);
      var s;
      for (s = 1; s < sampleN; ++s) {
        var idu = iVerts[s] * 2;
        var du = uvAr[idu] - u0;
        var dv = uvAr[idu + 1] - v0;
        var dUV = Math.sqrt(du * du + dv * dv);
        if (dUV > maxUV) maxUV = dUV;
      }
      if (maxUV > 1e-6) radiusUV = maxUV * 1.25;
    }

    for (var i = 0, l = iVerts.length; i < l; ++i) {
      var ind = iVerts[i] * 3;
      var vx = vAr[ind];
      var vy = vAr[ind + 1];
      var vz = vAr[ind + 2];
      var dx = vx - cx;
      var dy = vy - cy;
      var dz = vz - cz;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) / radius;
      if (dist > 1) dist = 1.0;

      var fallOff = Math.pow(1 - dist, softness);
      fallOff *= intensity * mAr[ind + 2] * picking.getAlpha(vx, vy, vz);
      var fallOffCompl = 1.0 - fallOff;

      if (this._writeAlbedo) {
        cAr[ind] = cAr[ind] * fallOffCompl + cr * fallOff;
        cAr[ind + 1] = cAr[ind + 1] * fallOffCompl + cg * fallOff;
        cAr[ind + 2] = cAr[ind + 2] * fallOffCompl + cb * fallOff;
      }

      if (this._writeRoughness) {
        mAr[ind] = mAr[ind] * fallOffCompl + roughness * fallOff;
      }

      if (this._writeMetalness) {
        mAr[ind + 1] = mAr[ind + 1] * fallOffCompl + metallic * fallOff;
      }

      if (paintMaps && fallOff > 0.001 && iVerts[i] < nbUnique && uvAr) {
        var u = uvAr[iVerts[i] * 2];
        var v = uvAr[iVerts[i] * 2 + 1];
        MeshPbrMaps.splatUV(
          mesh, u, v, radiusUV, fallOff,
          color, roughness, metallic,
          this._writeAlbedo, this._writeRoughness, this._writeMetalness
        );
      }
    }
  }

  paintAll() {
    var mesh = this.getMesh();
    var iVerts = this.getUnmaskedVertices();
    if (iVerts.length === 0)
      return;

    if (mesh.hasUV() && !(mesh.hasPbrMaps && mesh.hasPbrMaps())) {
      MeshPbrMaps.ensureOnMesh(mesh, MeshPbrMaps.DEFAULT_SIZE);
      mesh.setShaderType(Enums.Shader.PBR);
    }

    this.pushState(true);
    this._main.getStateManager().pushVertices(iVerts);

    var cAr = mesh.getColors();
    var mAr = mesh.getMaterials();
    var color = this._color;
    var roughness = this._material[0];
    var metallic = this._material[1];
    var cr = color[0];
    var cg = color[1];
    var cb = color[2];
    for (var i = 0, nb = iVerts.length; i < nb; ++i) {
      var ind = iVerts[i] * 3;
      var fallOff = mAr[ind + 2];
      var fallOffCompl = 1.0 - fallOff;

      if (this._writeAlbedo) {
        cAr[ind] = cAr[ind] * fallOffCompl + cr * fallOff;
        cAr[ind + 1] = cAr[ind + 1] * fallOffCompl + cg * fallOff;
        cAr[ind + 2] = cAr[ind + 2] * fallOffCompl + cb * fallOff;
      }

      if (this._writeRoughness) {
        mAr[ind] = mAr[ind] * fallOffCompl + roughness * fallOff;
      }

      if (this._writeMetalness) {
        mAr[ind + 1] = mAr[ind + 1] * fallOffCompl + metallic * fallOff;
      }
    }

    if (mesh.hasPbrMaps && mesh.hasPbrMaps()) {
      // Fill entire maps with paint color (respecting mask via vert path already applied for verts).
      var albedo = mesh.getAlbedoMapSlot();
      var mr = mesh.getMetalRoughMapSlot();
      if (this._writeAlbedo && albedo && albedo.ctx) {
        albedo.ctx.fillStyle = 'rgb(' + Math.round(cr * 255) + ',' + Math.round(cg * 255) + ',' + Math.round(cb * 255) + ')';
        albedo.ctx.fillRect(0, 0, albedo.size, albedo.size);
        albedo.dirty = true;
      }
      if (mr && mr.ctx && (this._writeRoughness || this._writeMetalness)) {
        var img = mr.ctx.getImageData(0, 0, mr.size, mr.size);
        var d = img.data;
        var rb = Math.round(roughness * 255);
        var mb = Math.round(metallic * 255);
        var p;
        for (p = 0; p < d.length; p += 4) {
          if (this._writeRoughness) d[p + 1] = rb;
          if (this._writeMetalness) d[p + 2] = mb;
          d[p + 3] = 255;
        }
        mr.ctx.putImageData(img, 0, 0);
        mr.dirty = true;
      }
      MeshPbrMaps.flush(mesh);
    }

    mesh.updateDuplicateColorsAndMaterials();
    mesh.updateDrawArrays();
    this.updateRender();
  }
}

export default Paint;
