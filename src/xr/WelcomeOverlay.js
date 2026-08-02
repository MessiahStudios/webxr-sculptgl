/**
 * First-load welcome: product logo, Messiah Studios links, Don't show again.
 * Pre-session only (desktop + Quest browser). Let's Sculpt dismisses; headset
 * callers may then open XR setup.
 */

var STORAGE_HIDE = 'sculptgl.welcome.hide';

var LINKS = [
  { label: 'Project on GitHub', href: 'https://github.com/MessiahStudios/webxr-sculptgl' },
  { label: 'Messiah Studios on GitHub', href: 'https://github.com/MessiahStudios' },
  { label: 'Portfolio', href: 'https://www.messiahstudios.site' },
  { label: 'Facebook', href: 'https://www.facebook.com/Messiah.Studios.Social' }
];

function readHidePref() {
  try {
    return localStorage.getItem(STORAGE_HIDE) === '1';
  } catch (e) {
    return false;
  }
}

function writeHidePref(hide) {
  try {
    if (hide)
      localStorage.setItem(STORAGE_HIDE, '1');
    else
      localStorage.removeItem(STORAGE_HIDE);
  } catch (e) { /* ignore */ }
}

function shouldShow() {
  return !readHidePref();
}

/**
 * @param {{ onHeadset?: boolean, immersiveOk?: boolean, onContinue?: function }} opts
 */
function show(opts) {
  opts = opts || {};
  if (!shouldShow()) {
    if (opts.onContinue) opts.onContinue();
    return;
  }

  var onHeadset = !!opts.onHeadset;
  var immersiveOk = !!opts.immersiveOk;
  var root = document.getElementById('webxr-sculpt-welcome');
  if (root) root.remove();

  root = document.createElement('div');
  root.id = 'webxr-sculpt-welcome';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Welcome to WebXR Sculpt');
  // Above XR setup modal (2147483646).
  root.style.cssText = [
    'display:flex', 'position:fixed', 'inset:0', 'z-index:2147483647',
    'align-items:center', 'justify-content:center', 'padding:16px',
    'box-sizing:border-box', 'font-family:Open Sans,Segoe UI,sans-serif',
    'background:rgba(10,12,16,0.88)', 'pointer-events:auto',
    'overflow:auto', '-webkit-overflow-scrolling:touch'
  ].join(';');

  var panel = document.createElement('div');
  panel.style.cssText = [
    'position:relative', 'z-index:1', 'pointer-events:auto',
    'max-width:440px', 'width:100%', 'max-height:min(92vh, 780px)',
    'overflow:auto', 'padding:22px 24px 20px', 'border-radius:12px',
    'background:#16181e', 'color:#e8ecff',
    'box-shadow:0 16px 48px rgba(0,0,0,0.55)',
    'border:1px solid rgba(88,168,240,0.28)', 'box-sizing:border-box',
    'text-align:center'
  ].join(';');
  panel.addEventListener('click', function (ev) { ev.stopPropagation(); });

  var logo = document.createElement('img');
  logo.src = 'resources/brand/webxr-sculpt-logo.png';
  logo.alt = 'WebXR Sculpt';
  logo.width = 280;
  logo.height = 280;
  logo.style.cssText = 'display:block;margin:0 auto 14px;width:min(280px,72vw);height:auto;border-radius:10px;';
  logo.addEventListener('error', function () {
    logo.style.display = 'none';
  });
  panel.appendChild(logo);

  var blurb = document.createElement('p');
  blurb.style.cssText = 'margin:0 0 14px;font-size:13px;line-height:1.5;color:#aeb4c0;';
  blurb.textContent = 'Quest-first digital clay — sculpt with mouse, pen, or headset. Same core on desktop and in the room.';
  panel.appendChild(blurb);

  var linkList = document.createElement('div');
  linkList.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin:0 0 18px;text-align:left;';
  var i;
  for (i = 0; i < LINKS.length; ++i) {
    var a = document.createElement('a');
    a.href = LINKS[i].href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = LINKS[i].label;
    a.style.cssText = [
      'display:block', 'padding:10px 12px', 'border-radius:8px',
      'border:1px solid rgba(140,160,200,0.22)', 'background:rgba(0,0,0,0.28)',
      'color:#58a8f0', 'font-size:13px', 'text-decoration:none',
      'box-sizing:border-box'
    ].join(';');
    linkList.appendChild(a);
  }
  panel.appendChild(linkList);

  if (onHeadset && immersiveOk) {
    var nextHint = document.createElement('p');
    nextHint.style.cssText = 'margin:0 0 12px;font-size:12px;line-height:1.4;color:#ffc48a;';
    nextHint.textContent = 'Next: choose MR/VR setup';
    panel.appendChild(nextHint);
  }

  var checkRow = document.createElement('label');
  checkRow.style.cssText = [
    'display:flex', 'align-items:center', 'justify-content:center', 'gap:8px',
    'margin:0 0 16px', 'font-size:13px', 'color:#c8d0e0', 'cursor:pointer',
    'user-select:none'
  ].join(';');
  var check = document.createElement('input');
  check.type = 'checkbox';
  check.id = 'webxr-sculpt-welcome-hide';
  check.style.cssText = 'width:16px;height:16px;accent-color:#58a8f0;cursor:pointer;';
  var checkText = document.createElement('span');
  checkText.textContent = 'Don\'t show this again';
  checkRow.appendChild(check);
  checkRow.appendChild(checkText);
  panel.appendChild(checkRow);

  var go = document.createElement('button');
  go.type = 'button';
  go.textContent = 'Let\'s Sculpt';
  go.style.cssText = [
    'width:100%', 'padding:12px 18px', 'border-radius:8px',
    'border:1px solid #3d6b9e', 'background:#1f4a7a', 'color:#fff',
    'font-size:15px', 'font-weight:600', 'cursor:pointer'
  ].join(';');
  go.addEventListener('click', function () {
    if (check.checked)
      writeHidePref(true);
    root.remove();
    if (opts.onContinue) opts.onContinue();
  });
  panel.appendChild(go);

  root.appendChild(panel);
  document.body.appendChild(root);
}

export default {
  STORAGE_HIDE: STORAGE_HIDE,
  shouldShow: shouldShow,
  show: show,
  readHidePref: readHidePref,
  writeHidePref: writeHidePref
};
