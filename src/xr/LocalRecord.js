/**
 * Local video recording helpers — MediaRecorder + canvas.captureStream.
 * Desktop: records the live WebGL canvas (same pixels the camera shows).
 * XR: falls back to mono FBO frames (same content as Local Snapshot PNG).
 */
var LocalRecord = {};

LocalRecord.FPS_OPTIONS = [12, 15, 24];

LocalRecord.QUALITY = {
  small: { id: 'small', label: 'Small', maxWidth: 640, bits: 700000 },
  balanced: { id: 'balanced', label: 'Balanced', maxWidth: 1280, bits: 1800000 },
  high: { id: 'high', label: 'High', maxWidth: 1920, bits: 4500000 }
};

LocalRecord.pickMimeType = function () {
  if (typeof MediaRecorder === 'undefined') return '';
  var candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
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

export default LocalRecord;
