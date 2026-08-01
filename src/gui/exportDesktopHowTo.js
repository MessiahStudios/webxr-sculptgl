/**
 * Desktop how-to / GitHub docs capture of the yagui chrome (sidebar + topbar).
 * Docs helper only — regenerate when the UI settles; not a product end-user feature.
 */
import { toBlob } from 'html-to-image';
import { saveAs } from 'file-saver';
import Enums from 'misc/Enums';

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function unlockFolderHeight(domUl) {
  var prev = {
    maxHeight: domUl.style.maxHeight,
    overflow: domUl.style.overflow,
    height: domUl.style.height
  };
  domUl.style.maxHeight = 'none';
  domUl.style.overflow = 'visible';
  domUl.style.height = 'auto';
  return function restore() {
    domUl.style.maxHeight = prev.maxHeight;
    domUl.style.overflow = prev.overflow;
    domUl.style.height = prev.height;
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

function captureNodePng(node, fileTag, bg) {
  return toBlob(node, {
    backgroundColor: bg || '#3c3c3c',
    pixelRatio: 2,
    cacheBust: true,
    // Skip huge WebGL canvas if it somehow nests under a capture root.
    filter: function (n) {
      return !(n && n.id === 'canvas');
    }
  }).then(function (blob) {
    if (!blob)
      return Promise.reject(new Error('Desktop UI capture failed (' + fileTag + ')'));
    var name = 'sculpt-desktop-ui-' + fileTag + '-' + Date.now() + '.png';
    saveAs(blob, name);
    return { name: name, bytes: blob.size, tag: fileTag };
  });
}

function captureSidebarFolder(ctrl, fileTag) {
  if (!ctrl || !ctrl._menu || !ctrl._menu.domUl)
    return Promise.resolve(null);
  var menu = ctrl._menu;
  var wasOpen = menu.isOpen;
  menu.open();
  return wait(320).then(function () {
    var restoreH = unlockFolderHeight(menu.domUl);
    return wait(80).then(function () {
      return captureNodePng(menu.domUl, fileTag, '#3c3c3c').finally(function () {
        restoreH();
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
  var restore = forceShowTopbarMenu(ctrl._menu);
  return wait(180).then(function () {
    return captureNodePng(ctrl._menu.domUl, fileTag, '#222222').finally(restore);
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
