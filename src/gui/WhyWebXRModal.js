/**
 * About → Why WebXR Sculpt? — short positioning modal vs known alternatives.
 */

var STYLE_ID = 'webxr-sculpt-why-css';
var ROOT_ID = 'webxr-sculpt-why';

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    '#webxr-sculpt-why{',
    'position:fixed;inset:0;z-index:2147483646;margin:0;',
    'display:grid;place-items:center;',
    'padding:max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))',
    ' max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));',
    'box-sizing:border-box;font-family:Open Sans,Segoe UI,sans-serif;',
    'background:rgba(10,12,16,0.88);pointer-events:auto;',
    'overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;',
    '}',
    '#webxr-sculpt-why .wxs-why-panel{',
    'width:min(480px, calc(100vw - 24px));max-width:100%;',
    'max-height:min(90dvh,90vh);overflow:auto;',
    'padding:22px 24px 18px;border-radius:12px;box-sizing:border-box;',
    'background:#16181e;color:#e8ecff;',
    'box-shadow:0 16px 48px rgba(0,0,0,0.55);',
    'border:1px solid rgba(88,168,240,0.28);text-align:left;',
    '}',
    '#webxr-sculpt-why h2{',
    'margin:0 0 10px;font-size:18px;font-weight:700;color:#fff;',
    '}',
    '#webxr-sculpt-why .wxs-why-lead{',
    'margin:0 0 14px;font-size:13px;line-height:1.55;color:#aeb4c0;',
    '}',
    '#webxr-sculpt-why ul{',
    'margin:0 0 16px;padding:0 0 0 18px;font-size:13px;line-height:1.55;color:#d5dae6;',
    '}',
    '#webxr-sculpt-why li{margin:0 0 8px;}',
    '#webxr-sculpt-why li strong{color:#58A8F0;font-weight:600;}',
    '#webxr-sculpt-why .wxs-why-close{',
    'display:block;width:100%;margin:0;padding:12px 14px;border-radius:8px;',
    'border:1px solid rgba(88,168,240,0.45);background:#243044;color:#eee;',
    'font-size:14px;font-weight:600;cursor:pointer;',
    '}',
    '#webxr-sculpt-why .wxs-why-close:hover{background:#2c3a52;}'
  ].join('');
  document.head.appendChild(style);
}

function close() {
  var root = document.getElementById(ROOT_ID);
  if (root && root.parentNode)
    root.parentNode.removeChild(root);
  document.removeEventListener('keydown', onKeyDown, true);
}

function onKeyDown(ev) {
  if (ev.key === 'Escape') {
    ev.preventDefault();
    close();
  }
}

function show() {
  if (typeof document === 'undefined') return;
  close();
  ensureStyles();

  var root = document.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'wxs-why-title');

  var panel = document.createElement('div');
  panel.className = 'wxs-why-panel';

  var title = document.createElement('h2');
  title.id = 'wxs-why-title';
  title.textContent = 'Why WebXR Sculpt?';

  var lead = document.createElement('p');
  lead.className = 'wxs-why-lead';
  lead.textContent =
    'Other VR sculpt and spatial design apps exist — and many are excellent. ' +
    'WebXR Sculpt stays for a different job: open-web digital clay you can teach, share, and open with a URL.';

  var list = document.createElement('ul');
  var points = [
    ['Open the browser — no store install.', 'Quest Browser or desktop: same sculpt core, enter MR/VR when you want.'],
    ['Digital clay first.', 'Human-scale form in the room — not CAD, not a floating DCC, not an XR UI mockup toolkit.'],
    ['One core for Desktop and immersive.', 'Teach or prep on a screen; judge proportion in the headset on the same file.'],
    ['Built to teach.', 'Chromebook-friendly, workshop-ready, open source — stay because the clay (and the lesson) travel with you.']
  ];
  var i;
  for (i = 0; i < points.length; i++) {
    var li = document.createElement('li');
    var strong = document.createElement('strong');
    strong.textContent = points[i][0] + ' ';
    li.appendChild(strong);
    li.appendChild(document.createTextNode(points[i][1]));
    list.appendChild(li);
  }

  var closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'wxs-why-close';
  closeBtn.textContent = 'Back to sculpting';
  closeBtn.addEventListener('click', close);

  panel.appendChild(title);
  panel.appendChild(lead);
  panel.appendChild(list);
  panel.appendChild(closeBtn);
  root.appendChild(panel);

  root.addEventListener('mousedown', function (ev) {
    if (ev.target === root)
      close();
  });

  document.body.appendChild(root);
  document.addEventListener('keydown', onKeyDown, true);
  closeBtn.focus();
}

export default {
  show: show,
  close: close
};
