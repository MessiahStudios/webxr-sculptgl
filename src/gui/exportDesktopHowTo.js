/**
 * Desktop how-to / GitHub docs capture of the yagui chrome (sidebar + topbar).
 * Docs helper only — regenerate when the UI settles; not a product end-user feature.
 *
 * html-to-image sizes from clientHeight, so scrolled / max-height panels clip unless we
 * unlock overflow and pass explicit scrollWidth × scrollHeight.
 */
import { toBlob } from 'html-to-image';
import { saveAs } from 'file-saver';
import Enums from 'misc/Enums';

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

/**
 * Temporarily remove clipping so scrollHeight reflects full content.
 * @param {HTMLElement} root
 * @returns {function(): void} restore
 */
function unlockClipAncestors(root) {
  var touched = [];
  function unlock(el) {
    if (!el || el.nodeType !== 1) return;
    touched.push({
      el: el,
      maxHeight: el.style.maxHeight,
      overflow: el.style.overflow,
      overflowX: el.style.overflowX,
      overflowY: el.style.overflowY,
      height: el.style.height
    });
    el.style.setProperty('max-height', 'none', 'important');
    el.style.setProperty('overflow', 'visible', 'important');
    el.style.setProperty('overflow-x', 'visible', 'important');
    el.style.setProperty('overflow-y', 'visible', 'important');
    el.style.height = 'auto';
  }

  unlock(root);
  var p = root.parentElement;
  var hops = 0;
  while (p && hops < 8) {
    var cls = p.classList;
    unlock(p);
    if (cls && (cls.contains('gui-sidebar') || cls.contains('gui-topbar')))
      break;
    if (p === document.body)
      break;
    p = p.parentElement;
    hops++;
  }

  return function restore() {
    var i;
    for (i = touched.length - 1; i >= 0; --i) {
      var t = touched[i];
      t.el.style.removeProperty('max-height');
      t.el.style.removeProperty('overflow');
      t.el.style.removeProperty('overflow-x');
      t.el.style.removeProperty('overflow-y');
      t.el.style.maxHeight = t.maxHeight;
      t.el.style.overflow = t.overflow;
      t.el.style.overflowX = t.overflowX;
      t.el.style.overflowY = t.overflowY;
      t.el.style.height = t.height;
    }
  };
}

function forceShowTopbarMenu(menu) {
  var ul = menu.domUl;
  var prev = {
    display: ul.style.display,
    opacity: ul.style.opacity,
    pointerEvents: ul.style.pointerEvents,
    top: ul.style.top,
    visibility: ul.style.visibility
  };
  ul.style.display = 'block';
  ul.style.opacity = '1';
  ul.style.pointerEvents = 'auto';
  ul.style.top = '30px';
  ul.style.visibility = 'visible';
  return function restore() {
    ul.style.display = prev.display;
    ul.style.opacity = prev.opacity;
    ul.style.pointerEvents = prev.pointerEvents;
    ul.style.top = prev.top;
    ul.style.visibility = prev.visibility;
  };
}

function measureFullBox(node) {
  // After unlock, prefer scroll metrics (full content) over client box (viewport).
  var w = Math.ceil(Math.max(node.scrollWidth, node.offsetWidth, node.clientWidth, 1));
  var h = Math.ceil(Math.max(node.scrollHeight, node.offsetHeight, node.clientHeight, 1));
  // Small pad so last row / slider isn’t flush-cropped by rasterization.
  return { width: w + 6, height: h + 10 };
}

function captureNodePng(node, fileTag, bg) {
  var box = measureFullBox(node);
  return toBlob(node, {
    backgroundColor: bg || '#3c3c3c',
    pixelRatio: 2,
    cacheBust: true,
    width: box.width,
    height: box.height,
    // Google Fonts is cross-origin — embedding throws SecurityError on cssRules
    // (noisy in __xr_logs). Local yagui.css is enough for docs PNGs.
    skipFonts: true,
    fontEmbedCSS: '',
    style: {
      maxHeight: 'none',
      overflow: 'visible',
      overflowX: 'visible',
      overflowY: 'visible',
      height: box.height + 'px',
      width: box.width + 'px',
      fontFamily: 'Open Sans,Segoe UI,system-ui,sans-serif'
    },
    // Skip huge WebGL canvas if it somehow nests under a capture root.
    filter: function (n) {
      return !(n && n.id === 'canvas');
    }
  }).then(function (blob) {
    if (!blob)
      return Promise.reject(new Error('Desktop UI capture failed (' + fileTag + ')'));
    var name = 'sculpt-desktop-ui-' + fileTag + '-' + Date.now() + '.png';
    saveAs(blob, name);
    return { name: name, bytes: blob.size, tag: fileTag, w: box.width, h: box.height };
  });
}

function captureSidebarFolder(ctrl, fileTag) {
  if (!ctrl || !ctrl._menu || !ctrl._menu.domUl)
    return Promise.resolve(null);
  var menu = ctrl._menu;
  var wasOpen = menu.isOpen;
  menu.open();
  return wait(360).then(function () {
    var restoreClip = unlockClipAncestors(menu.domUl);
    return wait(120).then(function () {
      return captureNodePng(menu.domUl, fileTag, '#3c3c3c').finally(function () {
        restoreClip();
        if (!wasOpen) menu.close();
      });
    });
  });
}

function setSculptTool(sculpting, toolIdx) {
  if (!sculpting) return;
  if (sculpting.onChangeTool)
    sculpting.onChangeTool(toolIdx);
  if (sculpting._ctrlSculpt && sculpting._ctrlSculpt.setValue)
    sculpting._ctrlSculpt.setValue(toolIdx);
}

function captureTopbarMenu(ctrl, fileTag) {
  if (!ctrl || !ctrl._menu || !ctrl._menu.domUl)
    return Promise.resolve(null);
  var restoreShow = forceShowTopbarMenu(ctrl._menu);
  var restoreClip = unlockClipAncestors(ctrl._menu.domUl);
  return wait(220).then(function () {
    return captureNodePng(ctrl._menu.domUl, fileTag, '#222222').finally(function () {
      restoreClip();
      restoreShow();
    });
  });
}

/**
 * @param {object} main Scene / app
 * @returns {Promise<Array<{name:string, bytes:number, tag:string}>>}
 */
export function exportDesktopHowToPack(main) {
  var gui = main.getGui && main.getGui();
  if (!gui)
    return Promise.reject(new Error('Desktop GUI not ready'));

  var out = [];
  var chain = Promise.resolve();

  function push(rec) {
    if (rec) out.push(rec);
  }

  // Sidebar panels (WebXR counterpart is the wrist dock how-to pack).
  chain = chain.then(function () {
    return captureSidebarFolder(gui._ctrlRendering, 'sidebar-rendering').then(push);
  });
  chain = chain.then(function () {
    return captureSidebarFolder(gui._ctrlTopology, 'sidebar-topology').then(push);
  });
  chain = chain.then(function () {
    setSculptTool(gui._ctrlSculpting, Enums.Tools.BRUSH);
    return wait(200).then(function () {
      return captureSidebarFolder(gui._ctrlSculpting, 'sidebar-sculpt-brush').then(push);
    });
  });
  chain = chain.then(function () {
    setSculptTool(gui._ctrlSculpting, Enums.Tools.PAINT);
    return wait(200).then(function () {
      return captureSidebarFolder(gui._ctrlSculpting, 'sidebar-sculpt-paint').then(push);
    });
  });

  // Topbar dropdowns — Files / Scene / Camera / History cover most how-to chrome.
  chain = chain.then(function () {
    return captureTopbarMenu(gui._ctrlFiles, 'topbar-files').then(push);
  });
  chain = chain.then(function () {
    return captureTopbarMenu(gui._ctrlScene, 'topbar-scene').then(push);
  });
  chain = chain.then(function () {
    return captureTopbarMenu(gui._ctrlCamera, 'topbar-camera').then(push);
  });
  chain = chain.then(function () {
    return captureTopbarMenu(gui._ctrlStates, 'topbar-states').then(push);
  });

  return chain.then(function () {
    return out;
  });
}
