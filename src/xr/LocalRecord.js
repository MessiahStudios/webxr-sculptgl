/**
 * Local video recording helpers — MediaRecorder + canvas.captureStream.
 * Desktop + XR both encode through a sized offscreen canvas (preset res + bitrate)
 * so Small/Balanced/High stay clean and efficient.
 */
var LocalRecord = {};

/** Prefer smoother defaults. */
LocalRecord.FPS_OPTIONS = [15, 24, 30];

LocalRecord.QUALITY = {
  // Generous bitrate at each size so motion stays clean (not blocky).
  small: { id: 'small', label: 'Small', maxWidth: 1280, height: 720, bits: 4500000 },
  balanced: { id: 'balanced', label: 'Balanced', maxWidth: 1600, height: 900, bits: 9000000 },
  high: { id: 'high', label: 'High', maxWidth: 1920, height: 1080, bits: 16000000 }
};

LocalRecord.pickMimeType = function () {
  if (typeof MediaRecorder === 'undefined') return '';
  var candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=h264',
    'video/mp4'
  ];
  var i;
  for (i = 0; i < candidates.length; ++i) {
    try {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(candidates[i]))
        return candidates[i];
    } catch (e) { /* ignore */ }
  }
  return '';
};

LocalRecord.extForMime = function (mime) {
  if (mime && mime.indexOf('mp4') >= 0) return 'mp4';
  return 'webm';
};

/** Even dimensions for encoder friendliness. */
LocalRecord.evenSize = function (w, h) {
  w = w | 0;
  h = h | 0;
  if (w & 1) w -= 1;
  if (h & 1) h -= 1;
  if (w < 2) w = 640;
  if (h < 2) h = 360;
  return { w: w, h: h };
};

/**
 * Fit source aspect into a quality preset box (no upscale past source).
 * @param {number} srcW
 * @param {number} srcH
 * @param {{maxWidth:number, height:number}} q
 */
LocalRecord.sizeForPreset = function (srcW, srcH, q) {
  var maxW = (q && q.maxWidth) | 0;
  var maxH = (q && q.height) | 0;
  if (maxW < 64) maxW = 1280;
  if (maxH < 64) maxH = 720;
  srcW = Math.max(1, srcW | 0);
  srcH = Math.max(1, srcH | 0);
  var aspect = srcW / srcH;
  var w = maxW;
  var h = Math.round(w / aspect);
  if (h > maxH) {
    h = maxH;
    w = Math.round(h * aspect);
  }
  // Don't invent pixels — if the live view is smaller, encode at source size.
  if (w > srcW || h > srcH) {
    w = srcW;
    h = srcH;
  }
  return LocalRecord.evenSize(w, h);
};

export default LocalRecord;
