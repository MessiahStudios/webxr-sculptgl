/**
 * Smartphone / short-landscape chrome: full-width canvas, Tools overlay,
 * compact topbar. Uses yagui Sidebar.hidden so viewport resize stays correct.
 */
var MOBILE_MQ = '(max-width: 900px), ((max-height: 520px) and (orientation: landscape))';

class MobileChrome {

  /** @param {*} gui */
  constructor(gui) {
    this._gui = gui;
    this._btn = null;
    this._scrim = null;
    this._open = false;
    this._mql = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(MOBILE_MQ)
      : null;
    this._boundSync = this.sync.bind(this);
    this._boundToggle = this.toggle.bind(this);
    this._boundClose = this.close.bind(this);
  }

  install() {
    if (!this._mql) return;
    if (this._mql.addEventListener)
      this._mql.addEventListener('change', this._boundSync);
    else if (this._mql.addListener)
      this._mql.addListener(this._boundSync);
    this.sync();
  }

  dispose() {
    if (!this._mql) return;
    if (this._mql.removeEventListener)
      this._mql.removeEventListener('change', this._boundSync);
    else if (this._mql.removeListener)
      this._mql.removeListener(this._boundSync);
    this._teardownChrome();
    document.body.classList.remove('wxs-mobile', 'wxs-mobile-sidebar-open');
  }

  isMobile() {
    return !!(this._mql && this._mql.matches);
  }

  sync() {
    var sidebar = this._gui && this._gui._sidebar;
    if (!sidebar) return;

    var mobile = this.isMobile();
    document.body.classList.toggle('wxs-mobile', mobile);

    if (mobile) {
      // Keep sidebar.hidden so yagui gives the canvas full width.
      sidebar.setVisibility(false);
      this._ensureChrome();
      if (!this._open)
        document.body.classList.remove('wxs-mobile-sidebar-open');
      else
        document.body.classList.add('wxs-mobile-sidebar-open');
      this._updateBtn();
    } else {
      this._open = false;
      document.body.classList.remove('wxs-mobile-sidebar-open');
      this._teardownChrome();
      sidebar.setVisibility(true);
    }
  }

  toggle() {
    if (!this.isMobile()) return;
    if (this._open) this.close();
    else this.open();
  }

  open() {
    if (!this.isMobile()) return;
    this._open = true;
    document.body.classList.add('wxs-mobile-sidebar-open');
    this._updateBtn();
  }

  close() {
    this._open = false;
    document.body.classList.remove('wxs-mobile-sidebar-open');
    this._updateBtn();
  }

  _ensureChrome() {
    if (this._btn) return;

    var scrim = document.createElement('div');
    scrim.id = 'wxs-mobile-scrim';
    scrim.setAttribute('aria-hidden', 'true');
    scrim.addEventListener('click', this._boundClose);
    document.body.appendChild(scrim);
    this._scrim = scrim;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'wxs-mobile-tools-btn';
    btn.setAttribute('aria-controls', 'gui-sidebar');
    btn.addEventListener('click', this._boundToggle);
    document.body.appendChild(btn);
    this._btn = btn;
    this._updateBtn();
  }

  _teardownChrome() {
    if (this._btn) {
      this._btn.removeEventListener('click', this._boundToggle);
      if (this._btn.parentNode) this._btn.parentNode.removeChild(this._btn);
      this._btn = null;
    }
    if (this._scrim) {
      this._scrim.removeEventListener('click', this._boundClose);
      if (this._scrim.parentNode) this._scrim.parentNode.removeChild(this._scrim);
      this._scrim = null;
    }
  }

  _updateBtn() {
    if (!this._btn) return;
    this._btn.textContent = this._open ? 'Close tools' : 'Tools';
    this._btn.setAttribute('aria-expanded', this._open ? 'true' : 'false');
    this._btn.classList.toggle('is-open', this._open);
  }
}

export default MobileChrome;
