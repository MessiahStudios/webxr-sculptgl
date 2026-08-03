/**
 * Pre-session XR preferences: controller profile fallback for webxr-input-profiles
 * (used when the runtime reports a generic profile or matching fails).
 */

var STORAGE_PROFILE = 'sculptgl.xr.profileFallback';
var STORAGE_MODE = 'sculptgl.xr.sessionMode';

/** @type {{ id: string, label: string }[]} */
var PROFILE_OPTIONS = [
  { id: 'auto', label: 'Auto-detect (recommended)' },
  { id: 'meta-quest-touch-plus', label: 'Meta Quest 3 (Touch Plus) — profile id: meta-quest-touch-plus' },
  { id: 'meta-quest-touch-plus-v2', label: 'Meta Quest — Touch Plus v2' },
  { id: 'meta-quest-touch-pro', label: 'Meta Quest Pro — Touch Pro' },
  { id: 'oculus-touch-v3', label: 'Meta Quest 2 / Touch v3' },
  { id: 'oculus-touch-v2', label: 'Oculus Rift S / Touch v2' },
  { id: 'pico-4', label: 'Pico 4' },
  { id: 'pico-4u', label: 'Pico 4 Ultra' },
  { id: 'pico-neo3', label: 'Pico Neo 3' },
  { id: 'valve-index', label: 'Valve Index' },
  { id: 'htc-vive', label: 'HTC Vive (wand)' },
  { id: 'htc-vive-cosmos', label: 'HTC Vive Cosmos' },
  { id: 'microsoft-mixed-reality', label: 'Windows Mixed Reality' },
  { id: 'samsung-galaxyxr', label: 'Samsung Galaxy XR' },
  { id: 'generic-trigger-squeeze-thumbstick', label: 'Generic (thumbstick + trigger + squeeze)' }
];

function detectProfileFromUA() {
  var ua = navigator.userAgent || '';
  if (/Quest|OculusBrowser|Oculus|Meta Quest/i.test(ua)) {
    if (/Quest Pro|QuestPro/i.test(ua)) return 'meta-quest-touch-pro';
    if (/Quest 2|Quest2/i.test(ua)) return 'oculus-touch-v3';
    // Quest 3, Quest 3S, and other current Quest headsets use Touch Plus in webxr-input-profiles.
    return 'meta-quest-touch-plus';
  }
  if (/Pico 4 Ultra|PICO 4 Ultra|4U/i.test(ua)) return 'pico-4u';
  if (/Pico|PICO|Neo3/i.test(ua)) return 'pico-neo3';
  if (/Valve Index/i.test(ua)) return 'valve-index';
  if (/Vive Cosmos/i.test(ua)) return 'htc-vive-cosmos';
  if (/Vive|HTC_VIVE/i.test(ua)) return 'htc-vive';
  if (/Windows Mixed Reality|WindowsMixedReality|Samsung Odyssey/i.test(ua)) return 'microsoft-mixed-reality';
  if (/Galaxy XR|GalaxyXR/i.test(ua)) return 'samsung-galaxyxr';
  return 'generic-trigger-squeeze-thumbstick';
}

/**
 * True when the page is likely running inside an HMD browser (Quest, Pico, etc.).
 * WebXR cannot prove a headset is plugged in before a session; UA is the practical signal.
 * Desktop Chrome with SteamVR must NOT auto-open setup — only show the chip.
 */
function isHeadsetBrowser() {
  var ua = navigator.userAgent || '';
  return /Quest|OculusBrowser|Oculus|Meta Quest|PicoBrowser|PICO|Helio|Wolvic|SamsungBrowser.*XR|XRBrowser/i.test(ua);
}

/**
 * Phone / small handset (not Quest). Android Chrome often reports immersive-ar/vr
 * via ARCore / Cardboard — that must NOT surface "XR setup" (iPhone already skips it).
 * Quest remains a headset browser even though it is Android-based.
 */
function isPhoneHandset() {
  if (isHeadsetBrowser()) return false;
  var ua = navigator.userAgent || '';
  if (/iPhone|iPod/i.test(ua)) return true;
  // Android phones include "Mobile"; many tablets omit it.
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return true;
  try {
    var minSide = Math.min(screen.width || 0, screen.height || 0);
    var maxSide = Math.max(screen.width || 0, screen.height || 0);
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var narrow = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
    // CSS-pixel phone envelope; excludes most tablets / desktops.
    if (coarse && narrow && minSide > 0 && minSide <= 550 && maxSide <= 1000)
      return true;
  } catch (e) { /* ignore */ }
  return false;
}

/**
 * Whether to show the XR setup chip / offer immersive entry.
 * Headsets: yes when WebXR immersive is available.
 * Phones: no (desktop sculpt UI only — same as iPhone).
 * Desktop with WebXR runtimes: yes (chip only; no auto-open).
 */
function shouldOfferXrEntry(immersiveOk) {
  if (!immersiveOk) return false;
  if (isHeadsetBrowser()) return true;
  if (isPhoneHandset()) return false;
  return true;
}

function readSavedProfileChoice() {
  try {
    return localStorage.getItem(STORAGE_PROFILE) || 'auto';
  } catch (e) {
    return 'auto';
  }
}

function writeSavedProfileChoice(id) {
  try {
    localStorage.setItem(STORAGE_PROFILE, id || 'auto');
  } catch (e) { /* ignore */ }
}

function readSavedSessionMode() {
  try {
    var m = localStorage.getItem(STORAGE_MODE);
    if (m === 'immersive-vr' || m === 'immersive-ar') return m;
  } catch (e) { /* ignore */ }
  return 'immersive-ar';
}

function writeSavedSessionMode(mode) {
  try {
    localStorage.setItem(STORAGE_MODE, mode === 'immersive-vr' ? 'immersive-vr' : 'immersive-ar');
  } catch (e) { /* ignore */ }
}

/**
 * Profile id passed to fetchProfile() as default when explicit match is weak.
 */
function resolveProfileFallback(choice) {
  if (!choice || choice === 'auto') return detectProfileFromUA();
  return choice;
}

function getProfilesBaseUrl() {
  return new URL('webxr-profiles/profiles/', window.location.href).href.replace(/\/+$/, '');
}

function fetchJson(url) {
  return fetch(url, { cache: 'no-store' }).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    return res.json();
  });
}

function probeAsset(url) {
  return fetch(url, { method: 'HEAD', cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return true;
    })
    .catch(function () {
      // Some static servers do not implement HEAD correctly.
      return fetch(url, { cache: 'no-store' }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
        return true;
      });
    });
}

/**
 * Validate that the selected/default controller profile can resolve local assets.
 * Returns { ok, profileId, message, assetUrl? }.
 */
function preflightProfileAssets(choice) {
  var profileId = resolveProfileFallback(choice);
  var profileUrl = getProfilesBaseUrl() + '/' + profileId + '/profile.json';

  return fetchJson(profileUrl)
    .then(function (profileJson) {
      var layouts = profileJson && profileJson.layouts ? profileJson.layouts : null;
      var keys = layouts ? Object.keys(layouts) : [];
      var i;
      var assetPath = null;
      for (i = 0; i < keys.length; ++i) {
        var lo = layouts[keys[i]];
        if (lo && lo.assetPath) {
          assetPath = lo.assetPath;
          break;
        }
      }
      if (!assetPath) {
        return {
          ok: false,
          profileId: profileId,
          message: 'No controller assetPath found in profile.json for "' + profileId + '".'
        };
      }

      var assetUrl = new URL(assetPath, profileUrl).href;
      return probeAsset(assetUrl).then(function () {
        return {
          ok: true,
          profileId: profileId,
          assetUrl: assetUrl,
          message: 'Controller profile ready: ' + profileId
        };
      });
    })
    .catch(function (err) {
      return {
        ok: false,
        profileId: profileId,
        message: 'Controller profile check failed for "' + profileId + '". ' + (err && err.message ? err.message : String(err))
      };
    });
}

export default {
  PROFILE_OPTIONS: PROFILE_OPTIONS,
  detectProfileFromUA: detectProfileFromUA,
  isHeadsetBrowser: isHeadsetBrowser,
  isPhoneHandset: isPhoneHandset,
  shouldOfferXrEntry: shouldOfferXrEntry,
  readSavedProfileChoice: readSavedProfileChoice,
  writeSavedProfileChoice: writeSavedProfileChoice,
  readSavedSessionMode: readSavedSessionMode,
  writeSavedSessionMode: writeSavedSessionMode,
  resolveProfileFallback: resolveProfileFallback,
  preflightProfileAssets: preflightProfileAssets
};
