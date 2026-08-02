/**
 * Shared Import-by-URL validation + fetch limits.
 * Browser-side only — host must still send CORS headers.
 */

var ALLOWED_EXT = ['obj', 'ply', 'stl', 'sgl', 'glb', 'gltf'];
var MAX_BYTES = 80 * 1024 * 1024; // 80 MiB hard cap
var FETCH_TIMEOUT_MS = 60000;

function extensionFromPath(pathname) {
  if (!pathname) return '';
  var base = String(pathname).split(/[?#]/)[0];
  var slash = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'));
  var lower = (slash >= 0 ? base.slice(slash + 1) : base).toLowerCase();
  var i;
  for (i = 0; i < ALLOWED_EXT.length; ++i) {
    if (lower.endsWith('.' + ALLOWED_EXT[i]))
      return ALLOWED_EXT[i];
  }
  return '';
}

/**
 * @param {string} raw
 * @returns {{ ok: true, url: string, fileType: string } | { ok: false, error: string }}
 */
function validateImportURL(raw) {
  // Pastes often insert newlines/spaces when wrapping long CDN links — strip them.
  var s = String(raw == null ? '' : raw).replace(/\s+/g, '').trim();
  if (!s)
    return { ok: false, error: 'Empty URL — paste a full https:// link to a mesh file.' };

  var parsed;
  try {
    parsed = new URL(s);
  } catch (e) {
    return { ok: false, error: 'Not a valid URL. Use https://… and verify it opens in a browser first.' };
  }

  var protocol = (parsed.protocol || '').toLowerCase();
  if (protocol === 'http:') {
    var host = (parsed.hostname || '').toLowerCase();
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return {
        ok: false,
        error: 'Only HTTPS is allowed (http:// is OK only for localhost / 127.0.0.1).'
      };
    }
  } else if (protocol !== 'https:') {
    return {
      ok: false,
      error: 'Blocked scheme “' + protocol + '”. Use an https:// URL to a mesh file.'
    };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: 'URLs with embedded username/password are not allowed.' };
  }

  var fileType = extensionFromPath(parsed.pathname);
  if (!fileType) {
    return {
      ok: false,
      error: 'Path must end in .obj, .ply, .stl, .sgl, .glb, or .gltf (query strings OK).'
    };
  }

  return { ok: true, url: parsed.href, fileType: fileType };
}

/** Short caution shown in Desktop prompt / XR toast. */
function cautionText() {
  return [
    'Verify the URL first (opens in a normal browser).',
    'Requires https:// (or http://localhost), a known mesh extension, and CORS from the host.',
    'Max ~80 MB. Do not paste private/internal links you do not trust.'
  ].join('\n');
}

function promptText() {
  return [
    'Import mesh from URL',
    '',
    cautionText(),
    '',
    'Formats: .obj .ply .stl .sgl .glb .gltf',
    '',
    'Default sample is the Khronos Duck .glb — leave it or paste your own https link (one line).'
  ].join('\n');
}

export default {
  ALLOWED_EXT: ALLOWED_EXT,
  MAX_BYTES: MAX_BYTES,
  FETCH_TIMEOUT_MS: FETCH_TIMEOUT_MS,
  extensionFromPath: extensionFromPath,
  validateImportURL: validateImportURL,
  cautionText: cautionText,
  promptText: promptText
};
