import Tablet from 'misc/Tablet';
import SculptBase from 'editing/tools/SculptBase';
import MeshPbrMaps from 'mesh/MeshPbrMaps';
import XRRemoteLog from 'xr/XRRemoteLog';

/**
 * Soften (Blend) — mix color / roughness / metalness toward 1-ring neighbors.
 * Mask channel is never written. Live PBR maps get splatUV of the averaged color.
 */
class Soften extends SculptBase {

  constructor(main) {
    super(main);

    this._radius = 50;
    this._hardness = 0.5;
    this._intensity = 0.65;
    this._flow = 1.0;
    this._stampSpacingFactor = 0.11;
    this._culling = false;
    this._idAlpha = 0;
    this._lockPosition = false;

    this._writeAlbedo = true;
    this._writeRoughness = true;
    this._writeMetalness = true;
  }

  end() {
    var mesh = this.getMesh();
    if (mesh && mesh.hasPbrMaps && mesh.hasPbrMaps())
      MeshPbrMaps.flush(mesh);
    SculptBase.prototype.end.call(this);
  }

  pushState() {
    this._main.getStateManager().pushStateColorAndMaterial(this.getMesh());
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

  dynamicTopology(picking) {
    return picking.getPickedVertices();
  }

  stroke(picking) {
    try {
      var iVertsInRadius = picking.getPickedVertices();
      var flow = this._flow === undefined ? 1.0 : this._flow;
      var intensity = this._intensity * flow * Tablet.getPressureIntensity();

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
    } catch (err) {
      XRRemoteLog.see('DESKTOP', 'Soften stroke ERROR', {
        error: String(err && err.message || err),
        stack: err && err.stack ? String(err.stack).slice(0, 400) : undefined
      });
      throw err;
    }
  }

  paint(iVerts, center, radiusSquared, intensity, hardness, picking) {
    var mesh = this.getMesh();
    var vAr = mesh.getVertices();
    var cAr = mesh.getColors();
    var mAr = mesh.getMaterials();
    var vrvStartCount = mesh.getVerticesRingVertStartCount();
    var vertRingVert = mesh.getVerticesRingVert();
    var ringVerts = vertRingVert instanceof Array ? vertRingVert : null;

    var radius = Math.sqrt(radiusSquared);
    var cx = center[0];
    var cy = center[1];
    var cz = center[2];
    var softness = 2 * (1 - hardness);
    var paintMaps = mesh.hasPbrMaps && mesh.hasPbrMaps();
    var uvAr = paintMaps ? mesh.getTexCoords() : null;
    var nbUnique = mesh.getNbVertices();
    var avgColor = [0, 0, 0];

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
      var id = iVerts[i];
      var ind = id * 3;
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
      if (fallOff < 1e-5) continue;

      var start;
      var end;
      var ring = null;
      if (ringVerts) {
        ring = ringVerts[id];
        start = 0;
        end = ring.length;
      } else {
        start = vrvStartCount[id * 2];
        end = start + vrvStartCount[id * 2 + 1];
      }

      var avr = 0;
      var avg = 0;
      var avb = 0;
      var avRough = 0;
      var avMetal = 0;
      var count = 0;
      var j;
      for (j = start; j < end; ++j) {
        var nid = ring ? ring[j] : vertRingVert[j];
        var n3 = nid * 3;
        avr += cAr[n3];
        avg += cAr[n3 + 1];
        avb += cAr[n3 + 2];
        avRough += mAr[n3];
        avMetal += mAr[n3 + 1];
        count++;
      }
      if (count < 1) continue;
      avr /= count;
      avg /= count;
      avb /= count;
      avRough /= count;
      avMetal /= count;

      var fallOffCompl = 1.0 - fallOff;
      if (this._writeAlbedo) {
        cAr[ind] = cAr[ind] * fallOffCompl + avr * fallOff;
        cAr[ind + 1] = cAr[ind + 1] * fallOffCompl + avg * fallOff;
        cAr[ind + 2] = cAr[ind + 2] * fallOffCompl + avb * fallOff;
      }
      if (this._writeRoughness)
        mAr[ind] = mAr[ind] * fallOffCompl + avRough * fallOff;
      if (this._writeMetalness)
        mAr[ind + 1] = mAr[ind + 1] * fallOffCompl + avMetal * fallOff;

      if (paintMaps && fallOff > 0.001 && id < nbUnique && uvAr) {
        avgColor[0] = avr;
        avgColor[1] = avg;
        avgColor[2] = avb;
        MeshPbrMaps.splatUV(
          mesh, uvAr[id * 2], uvAr[id * 2 + 1], radiusUV, fallOff,
          avgColor, avRough, avMetal,
          this._writeAlbedo, this._writeRoughness, this._writeMetalness
        );
      }
    }
  }
}

export default Soften;
