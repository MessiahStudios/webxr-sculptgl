/**
 * First-load welcome: product logo, Messiah Studios links, Don't show again.
 * Pre-session only (desktop + Quest browser). Let's Sculpt dismisses; headset
 * callers may then open XR setup.
 */

var STORAGE_HIDE = 'sculptgl.welcome.hide';
var STYLE_ID = 'webxr-sculpt-welcome-css';

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

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    'html.wxs-welcome-open, body.wxs-welcome-open{',
    'overflow:hidden !important;overscroll-behavior:none;',
    '}',
    '#webxr-sculpt-welcome{',
    'position:fixed;left:0;top:0;right:0;bottom:0;',
    'width:100vw;width:100dvw;max-width:100%;',
    'height:100vh;height:100dvh;max-height:100%;',
    'z-index:2147483647;margin:0;',
    'display:grid;place-items:center;',
    'padding:max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))',
    ' max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));',
    'box-sizing:border-box;font-family:Open Sans,Segoe UI,sans-serif;',
    'background:rgba(10,12,16,0.88);pointer-events:auto;',
    'overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;',
    '}',
    '#webxr-sculpt-welcome .wxs-welcome-panel{',
    'position:relative;z-index:1;pointer-events:auto;',
    'width:min(440px, calc(100vw - 24px));max-width:100%;',
    'max-height:min(92dvh,92vh,780px);',
    'overflow:auto;padding:22px 24px 20px;border-radius:12px;',
    'background:#16181e;color:#e8ecff;',
    'box-shadow:0 16px 48px rgba(0,0,0,0.55);',
    'border:1px solid rgba(88,168,240,0.28);box-sizing:border-box;',
    'text-align:center;justify-self:center;align-self:center;margin:0 auto;',
    '}',
    '#webxr-sculpt-welcome .wxs-welcome-logo{',
    'display:block;margin:0 auto 14px;width:min(220px,52vw);height:auto;',
    'max-width:100%;border-radius:10px;',
    '}',
    '#webxr-sculpt-welcome .wxs-welcome-blurb{',
    'margin:0 0 14px;font-size:13px;line-height:1.5;color:#aeb4c0;',
    '}',
    '#webxr-sculpt-welcome .wxs-welcome-links{',
    'display:flex;flex-direction:column;gap:8px;margin:0 0 18px;text-align:left;',
    '}',
    '#webxr-sculpt-welcome .wxs-welcome-links a{',
    'display:flex;align-items:center;padding:12px 12px;border-radius:8px;',
    'border:1px solid rgba(140,160,200,0.22);background:rgba(0,0,0,0.28);',
    'color:#58a8f0;font-size:13px;text-decoration:none;box-sizing:border-box;',
    'min-height:44px;line-height:1.3;',
    '}',
    '#webxr-sculpt-welcome .wxs-welcome-hint{',
    'margin:0 0 12px;font-size:12px;line-height:1.4;color:#ffc48a;',
    '}',
    '#webxr-sculpt-welcome .wxs-welcome-check{',
    'display:flex;align-items:center;justify-content:center;gap:8px;',
    'margin:0 0 16px;font-size:13px;color:#c8d0e0;cursor:pointer;user-select:none;',
    '}',
    '#webxr-sculpt-welcome .wxs-welcome-check input{',
    'width:18px;height:18px;accent-color:#58a8f0;cursor:pointer;flex:0 0 auto;',
    '}',
    '#webxr-sculpt-welcome .wxs-welcome-go{',
    'width:100%;padding:14px 18px;border-radius:8px;',
    'border:1px solid #3d6b9e;background:#1f4a7a;color:#fff;',
    'font-size:15px;font-weight:600;cursor:pointer;min-height:48px;',
    'touch-action:manipulation;',
    '}',
    '@media (max-width:480px){',
    '#webxr-sculpt-welcome{place-items:start center;padding-top:max(10px, env(safe-area-inset-top));}',
    '#webxr-sculpt-welcome .wxs-welcome-panel{',
    'width:calc(100vw - 20px);padding:14px 14px 16px;max-height:min(96dvh,96vh);border-radius:10px;',
    '}',
    '#webxr-sculpt-welcome .wxs-welcome-logo{width:min(140px,40vw);margin-bottom:10px;}',
    '#webxr-sculpt-welcome .wxs-welcome-blurb{font-size:12px;margin-bottom:10px;}',
    '#webxr-sculpt-welcome .wxs-welcome-links{gap:6px;margin-bottom:12px;}',
    '#webxr-sculpt-welcome .wxs-welcome-check{margin-bottom:12px;font-size:12px;}',
    '}',
    '@media (max-height:560px) and (orientation:landscape){',
    '#webxr-sculpt-welcome{place-items:start center;}',
    '#webxr-sculpt-welcome .wxs-welcome-panel{max-height:min(94dvh,94vh);padding:12px 14px;width:min(420px, calc(100vw - 24px));}',
    '#webxr-sculpt-welcome .wxs-welcome-logo{width:min(88px,20vh);margin-bottom:8px;}',
    '#webxr-sculpt-welcome .wxs-welcome-blurb{font-size:12px;margin-bottom:8px;}',
    '#webxr-sculpt-welcome .wxs-welcome-links{gap:5px;margin-bottom:10px;}',
    '}'
  ].join('');
  document.head.appendChild(style);
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

  ensureStyles();

  var onHeadset = !!opts.onHeadset;
  var immersiveOk = !!opts.immersiveOk;
  var root = document.getElementById('webxr-sculpt-welcome');
  if (root) root.remove();

  document.documentElement.classList.add('wxs-welcome-open');
  document.body.classList.add('wxs-welcome-open');

  root = document.createElement('div');
  root.id = 'webxr-sculpt-welcome';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Welcome to WebXR Sculpt');

  var panel = document.createElement('div');
  panel.className = 'wxs-welcome-panel';
  panel.addEventListener('click', function (ev) { ev.stopPropagation(); });

  var logo = document.createElement('img');
  logo.className = 'wxs-welcome-logo';
  logo.src = 'resources/brand/webxr-sculpt-logo.png';
  logo.alt = 'WebXR Sculpt';
  logo.width = 220;
  logo.height = 220;
  logo.addEventListener('error', function () {
    logo.style.display = 'none';
  });
  panel.appendChild(logo);

  var blurb = document.createElement('p');
  blurb.className = 'wxs-welcome-blurb';
  blurb.textContent = 'Quest-first digital clay — sculpt with mouse, pen, or headset. Same core on desktop and in the room.';
  panel.appendChild(blurb);

  var linkList = document.createElement('div');
  linkList.className = 'wxs-welcome-links';
  var i;
  for (i = 0; i < LINKS.length; ++i) {
    var a = document.createElement('a');
    a.href = LINKS[i].href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = LINKS[i].label;
    linkList.appendChild(a);
  }
  panel.appendChild(linkList);

  if (onHeadset && immersiveOk) {
    var nextHint = document.createElement('p');
    nextHint.className = 'wxs-welcome-hint';
    nextHint.textContent = 'Next: choose MR/VR setup';
    panel.appendChild(nextHint);
  }

  var checkRow = document.createElement('label');
  checkRow.className = 'wxs-welcome-check';
  var check = document.createElement('input');
  check.type = 'checkbox';
  check.id = 'webxr-sculpt-welcome-hide';
  var checkText = document.createElement('span');
  checkText.textContent = 'Don\'t show this again';
  checkRow.appendChild(check);
  checkRow.appendChild(checkText);
  panel.appendChild(checkRow);

  function dismiss() {
    document.documentElement.classList.remove('wxs-welcome-open');
    document.body.classList.remove('wxs-welcome-open');
    if (root && root.parentNode) root.parentNode.removeChild(root);
  }

  var go = document.createElement('button');
  go.type = 'button';
  go.className = 'wxs-welcome-go';
  go.textContent = 'Let\'s Sculpt';
  go.addEventListener('click', function () {
    if (check.checked)
      writeHidePref(true);
    dismiss();
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
