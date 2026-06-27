/* =====================================================================
 * <exposure-triangle> — reusable photographic-exposure visualiser
 * ---------------------------------------------------------------------
 * A self-contained vanilla Web Component (no framework, no build step).
 * Renders the interactive ISO / Time / Aperture exposure space with a
 * live WebGL preview photo. Three.js is loaded automatically from a CDN
 * if it isn't already on the page.
 *
 * USAGE (e.g. inside a Quarto raw-HTML block)
 * -------------------------------------------
 *   <script src="exposure-triangle.js"></script>
 *   <exposure-triangle style="height:560px"></exposure-triangle>
 *
 * Or mount programmatically into any element:
 *   ExposureTriangle.mount('#target', { accent:'#F5B544', height:'600px' });
 *
 * ATTRIBUTES / OPTIONS
 *   accent      CSS colour for dials + marker        (default #F5B544)
 *   scene       URL of the preview photo PNG          (default ./scene.png)
 *               The PNG's ALPHA channel is used as a depth map
 *               (0 = near / in-focus foreground, 1 = far background).
 *   floor-grid  "false" to hide the F–T floor grid    (default shown)
 *   spin        present/"true" to auto-rotate         (default off)
 *   three-src   override the Three.js script URL
 *
 * The element fits its own box — give it a height via CSS/attribute.
 * It emits a "change" event ({iso,f,t,ev,mode}) whenever the state moves.
 * ===================================================================== */
(function () {
  'use strict';

  var THREE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var FONTS_HREF = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap';

  // Resolve the default scene PNG relative to THIS script's own URL so the
  // bundled photo is found wherever the script is served from (e.g. a Quarto
  // extension's _extensions/.../ lib folder). An explicit `scene` attribute
  // still overrides. In the standalone case this resolves to the same place
  // as the old './scene.png' default.
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
  var DEFAULT_SCENE = (function () {
    if (SCRIPT_SRC) { try { return new URL('scene.png', SCRIPT_SRC).href; } catch (e) {} }
    return './scene.png';
  })();

  function loadThree(src) {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (window.__etThree) return window.__etThree;
    window.__etThree = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src || THREE_SRC;
      s.onload = function () { res(window.THREE); };
      s.onerror = function () { rej(new Error('exposure-triangle: failed to load Three.js')); };
      document.head.appendChild(s);
    });
    return window.__etThree;
  }

  function ensureFonts() {
    if (document.getElementById('et-fonts')) return;
    [['preconnect', 'https://fonts.googleapis.com'], ['preconnect', 'https://fonts.gstatic.com', true]]
      .forEach(function (p) { var l = document.createElement('link'); l.rel = p[0]; l.href = p[1]; if (p[2]) l.crossOrigin = ''; document.head.appendChild(l); });
    var link = document.createElement('link');
    link.id = 'et-fonts'; link.rel = 'stylesheet'; link.href = FONTS_HREF;
    document.head.appendChild(link);
  }

  var SHELL = '' +
    '<style>' +
    ':host{ display:block; position:relative; width:100%; height:560px; }' +
    '*{ box-sizing:border-box; }' +
    '.et-root{ position:absolute; inset:0; display:flex; font-family:"IBM Plex Sans",system-ui,sans-serif;' +
    '  color:#e9ecf1; overflow:hidden; background:radial-gradient(120% 120% at 70% 0%, #16181d 0%, #0c0d10 60%); }' +
    '.et-num{ font-family:"IBM Plex Mono",monospace; font-variant-numeric:tabular-nums; }' +
    '.et-track{ touch-action:none; }' +
    '.et-knob{ touch-action:none; }' +
    'aside{ width:448px; flex:none; height:100%; display:flex; flex-direction:column; padding:22px 18px 16px;' +
    '  background:linear-gradient(180deg,#15171c 0%,#101216 100%); border-right:1px solid #23262e; box-shadow:24px 0 60px -40px #000; }' +
    'main{ flex:1; position:relative; min-width:0; }' +
    'button{ font-family:inherit; }' +
    '</style>' +
    '<div class="et-root">' +
    '  <aside>' +
    '    <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:4px;">' +
    '      <div style="font-size:18px; font-weight:700; letter-spacing:.2px;">Exposure</div>' +
    '      <div class="et-num" style="font-size:11px; color:#6b7280; letter-spacing:1.5px;">ISO &middot; T &middot; F</div>' +
    '    </div>' +
    '    <div style="font-size:12.5px; color:#7c8493; line-height:1.5; margin-bottom:20px;">Set the scene light with <b style="color:#aeb6c2;">Lum.</b>, drag a dial, or tap <b style="color:#aeb6c2;">AUTO</b> to hand it to the camera.</div>' +
    '    <div class="et-toggle" style="display:flex; gap:4px; margin-bottom:14px; background:#0e1014; border:1px solid #23262e; border-radius:11px; padding:4px;"></div>' +
    '    <div class="et-panel" style="flex:1; display:flex; gap:9px; min-height:0;"></div>' +
    '    <div style="margin-top:16px; padding:14px 16px; background:#0e1014; border:1px solid #23262e; border-radius:14px;">' +
    '      <div style="display:flex; align-items:center; justify-content:space-between;">' +
    '        <div><div style="font-size:10px; letter-spacing:1.6px; color:#6b7280;">MODE</div>' +
    '          <div class="et-mode" style="font-size:15px; font-weight:600; margin-top:2px;">FULL AUTO</div></div>' +
    '        <div style="text-align:right;"><div style="font-size:10px; letter-spacing:1.6px; color:#6b7280;">EXPOSURE</div>' +
    '          <div class="et-ev et-num" style="font-size:15px; font-weight:600; margin-top:2px;">0.0 EV</div></div>' +
    '      </div>' +
    '      <div class="et-err" style="margin-top:10px; font-size:12px; color:#8b93a1; line-height:1.45; min-height:17px;"></div>' +
    '    </div>' +
    '  </aside>' +
    '  <main>' +
    '    <div class="et-host" style="position:absolute; inset:0;"></div>' +
    '    <div style="position:absolute; top:22px; left:24px; pointer-events:none;">' +
    '      <div style="font-size:11px; letter-spacing:2px; color:#5f6775;">THE EXPOSURE SPACE</div>' +
    '      <div style="font-size:13px; color:#828b9a; margin-top:3px;">drag to orbit &middot; scroll to zoom</div>' +
    '    </div>' +
    '    <div style="position:absolute; bottom:20px; left:24px; display:flex; gap:18px; font-size:11.5px; color:#7c8493; pointer-events:none;">' +
    '      <span style="display:flex; align-items:center; gap:7px;"><span class="et-legend" style="width:10px;height:10px;border-radius:50%;background:#F5B544;box-shadow:0 0 10px #F5B544;"></span>chosen exposure</span>' +
    '      <span style="display:flex; align-items:center; gap:7px;"><span style="width:16px;height:0;border-top:2px dashed #5b6478;"></span>projection</span>' +
    '    </div>' +
    '  </main>' +
    '</div>';

  class ExposureTriangle extends HTMLElement {
    static get observedAttributes() { return ['accent', 'floor-grid', 'spin']; }

    // ---------------- ladders ----------------
    get LADDERS() {
      if (this._ladders) return this._ladders;
      var mk = function (vals, refIdx, step, dir, prefIdx) {
        return { vals: vals, refIdx: refIdx, prefIdx: (prefIdx == null ? refIdx : prefIdx), step: step, N: vals.length,
          ev: vals.map(function (_, i) { return dir === 'up' ? (i - refIdx) * step : (refIdx - i) * step; }) };
      };
      // refIdx = where EV 0 sits (sunny-16 calibration: ISO100 / f16 / 1/100).
      // prefIdx = the heuristic's "best" value (aperture near f/5.6).
      this._ladders = {
        half: {
          iso: mk(['100', '140', '200', '280', '400', '560', '800', '1100', '1600', '2200', '3200', '4500', '6400'], 0, 0.5, 'up', 0),
          f:   mk(['1.4', '1.7', '2', '2.4', '2.8', '3.3', '4', '4.8', '5.6', '6.7', '8', '9.5', '11', '13', '16'], 14, 0.5, 'down', 8),
          t:   mk(['1"', '0.7"', '1/2', '1/3', '1/4', '1/6', '1/8', '1/10', '1/15', '1/20', '1/30', '1/45', '1/60', '1/90', '1/125', '1/180', '1/250', '1/350', '1/500', '1/750', '1/1000'], 14, 0.5, 'down', 20)
        },
        third: {
          iso: mk(['100', '125', '160', '200', '250', '320', '400', '500', '640', '800', '1000', '1250', '1600', '2000', '2500', '3200', '4000', '5000', '6400'], 0, 1 / 3, 'up', 0),
          f:   mk(['1.4', '1.6', '1.8', '2', '2.2', '2.5', '2.8', '3.2', '3.5', '4', '4.5', '5', '5.6', '6.3', '7.1', '8', '9', '10', '11', '13', '14', '16'], 21, 1 / 3, 'down', 12),
          t:   mk(['1"', '0.8"', '0.6"', '1/2', '0.4"', '1/3', '1/4', '1/5', '1/6', '1/8', '1/10', '1/13', '1/15', '1/20', '1/25', '1/30', '1/40', '1/50', '1/60', '1/80', '1/100', '1/125', '1/160', '1/200', '1/250', '1/320', '1/400', '1/500', '1/640', '1/800', '1/1000'], 20, 1 / 3, 'down', 30)
        }
      };
      return this._ladders;
    }
    get L_() { return this.LADDERS[this.stepMode]; }
    compLad(mode) {
      mode = mode || this.stepMode;
      var step = this.LADDERS[mode].iso.step, n = Math.round(3 / step), vals = [], ev = [];
      for (var k = -n; k <= n; k++) { var v = k * step; ev.push(v); vals.push((v > 0 ? '+' : '') + v.toFixed(1)); }
      return { vals: vals, ev: ev, center: n, N: vals.length, step: step };
    }
    lumLad(mode) {
      mode = mode || this.stepMode;
      var step = this.LADDERS[mode].iso.step, lo = -9, hi = 1, vals = [], ev = [], center = 0, i = 0;
      for (var v = lo; v <= hi + 1e-9; v += step) {
        var vv = Math.round(v / step) * step;
        ev.push(vv); vals.push((vv > 0 ? '+' : '') + vv.toFixed(1));
        if (Math.abs(vv) < 1e-6) center = i;
        i++;
      }
      return { vals: vals, ev: ev, center: center, N: vals.length, step: step };
    }
    get lum() { return this.lumLad().ev[this.lumIdx]; }
    whole(ev) { return Math.abs(ev - Math.round(ev)) < 1e-6; }
    range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
    nearestEv(arr, v) { var bi = 0, bd = 1e9; arr.forEach(function (e, i) { var d = Math.abs(e - v); if (d < bd) { bd = d; bi = i; } }); return bi; }

    setStep(mode) {
      if (mode === this.stepMode) return;
      var old = this.L_, oc = this.compLad(), oldLum = this.lumLad().ev[this.lumIdx];
      var oldEv = { iso: old.iso.ev[this.cam.iso.idx], f: old.f.ev[this.cam.f.idx], t: old.t.ev[this.cam.t.idx], comp: oc.ev[this.cam.comp.idx] };
      this.stepMode = mode;
      var nw = this.L_, nc = this.compLad();
      this.cam.iso.idx = this.nearestEv(nw.iso.ev, oldEv.iso);
      this.cam.f.idx = this.nearestEv(nw.f.ev, oldEv.f);
      this.cam.t.idx = this.nearestEv(nw.t.ev, oldEv.t);
      this.cam.comp.idx = this.nearestEv(nc.ev, oldEv.comp);
      this.lumIdx = this.nearestEv(this.lumLad().ev, oldLum);
      this._slidersBuilt = false; this.buildSliders();
      if (this.scene) this.buildTickLabels();
      this.updateToggle();
      this.update();
    }

    // ---------------- solver ----------------
    solve() {
      var Lf = this.L_, c = this.cam;
      // correct exposure: raw must equal (comp - scene luminosity)
      var target = (c.comp.auto ? 0 : this.compLad().ev[c.comp.idx]) - this.lum;
      var isoOpts = c.iso.auto ? this.range(Lf.iso.N) : [c.iso.idx];
      var fOpts = c.f.auto ? this.range(Lf.f.N) : [c.f.idx];
      var tOpts = c.t.auto ? this.range(Lf.t.N) : [c.t.idx];
      var best = null, self = this;
      isoOpts.forEach(function (ii) { fOpts.forEach(function (fi) { tOpts.forEach(function (ti) {
        var raw = Lf.iso.ev[ii] + Lf.f.ev[fi] + Lf.t.ev[ti];
        var cost = [Math.round(Math.abs(raw - target) * 1000), Math.abs(fi - Lf.f.prefIdx), ii, (Lf.t.N - 1 - ti)];
        if (!best || self.less(cost, best.cost)) best = { cost: cost, ii: ii, fi: fi, ti: ti, raw: raw };
      }); }); });
      this.solved = { iso: best.ii, f: best.fi, t: best.ti, raw: best.raw, target: target };
      return this.solved;
    }
    less(a, b) { for (var i = 0; i < a.length; i++) { if (a[i] < b[i]) return true; if (a[i] > b[i]) return false; } return false; }

    modeInfo() {
      var c = this.cam, autos = ['iso', 'f', 't'].filter(function (k) { return c[k].auto; }), n = autos.length;
      if (n === 3) return { label: 'FULL AUTO', kind: 3 };
      if (n === 2) { var free = ['iso', 'f', 't'].find(function (k) { return !c[k].auto; });
        return { label: { iso: 'ISO PRIORITY', f: 'APERTURE PRIORITY', t: 'SHUTTER PRIORITY' }[free], kind: 2, free: free, autos: autos }; }
      if (n === 1) return { label: 'SEMI-MANUAL', kind: 1, autos: autos };
      return { label: 'MANUAL', kind: 0, autos: [] };
    }

    // ---------------- lifecycle ----------------
    connectedCallback() {
      if (this._mounted) return; this._mounted = true;
      this.stepMode = 'half';
      this.cam = { iso: { idx: 0, auto: true }, t: { idx: 14, auto: true }, f: { idx: 14, auto: true }, comp: { idx: 6, auto: true } };
      this.lumIdx = this.lumLad().center;
      this.solved = { iso: 0, f: 14, t: 14, raw: 0, target: 0 };

      ensureFonts();
      this.attachShadow({ mode: 'open' }).innerHTML = SHELL;
      var $ = this.shadowRoot.querySelector.bind(this.shadowRoot);
      this.toggleEl = $('.et-toggle'); this.panel = $('.et-panel'); this.host = $('.et-host');
      this.modeLabelEl = $('.et-mode'); this.evTextEl = $('.et-ev'); this.errTextEl = $('.et-err'); this.legendEl = $('.et-legend');

      this.applyProps();
      this.solve();
      this.buildToggle();
      this.buildSliders();   // paints panel immediately (3D fills in once Three loads)

      var self = this;
      loadThree(this.getAttribute('three-src')).then(function () {
        if (!self.isConnected) return;
        self.initThree(); self.update();
      }).catch(function (e) { console.error(e); });
    }

    disconnectedCallback() {
      this._mounted = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      if (this._ro) this._ro.disconnect();
      var w = window;
      if (this._slMove) { w.removeEventListener('pointermove', this._slMove); w.removeEventListener('pointerup', this._slUp); }
      if (this._obMove) { w.removeEventListener('pointermove', this._obMove); w.removeEventListener('pointerup', this._obUp); }
    }

    attributeChangedCallback() { if (this._mounted) { this.applyProps(); this.updateToggle(); if (this._sl) this.refreshSliders(); } }

    applyProps() {
      this._accent = this.getAttribute('accent') || '#F5B544';
      if (this.grid) this.grid.visible = this.getAttribute('floor-grid') !== 'false';
      this._spin = this.hasAttribute('spin') && this.getAttribute('spin') !== 'false';
    }

    // ---------------- toggle ----------------
    buildToggle() {
      this.toggleEl.innerHTML = '';
      var self = this;
      var mk = function (label, mode) {
        var b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'flex:1; font:600 11px/1 "IBM Plex Sans",sans-serif; letter-spacing:.3px; padding:8px 0; border-radius:8px; border:none; background:transparent; color:#7c8493; cursor:pointer; transition:.15s;';
        b.onclick = function () { self.setStep(mode); };
        self.toggleEl.appendChild(b); return b;
      };
      this._tgHalf = mk('\u00BD stops', 'half');
      this._tgThird = mk('\u2153 stops', 'third');
      this.updateToggle();
    }
    updateToggle() {
      if (!this._tgHalf) return;
      var accent = this._accent || '#F5B544';
      var on = function (b, a) { b.style.background = a ? accent : 'transparent'; b.style.color = a ? '#181818' : '#7c8493'; };
      on(this._tgHalf, this.stepMode === 'half');
      on(this._tgThird, this.stepMode === 'third');
    }

    // ---------------- sliders ----------------
    buildSliders() {
      var self = this;
      if (!this._dragBound) {
        this._dragBound = true;
        this._slMove = function (e) { if (self._activeDrag) { self._activeDrag((e.touches ? e.touches[0] : e).clientY); e.preventDefault(); } };
        this._slUp = function () { self._activeDrag = null; };
        window.addEventListener('pointermove', this._slMove);
        window.addEventListener('pointerup', this._slUp);
      }
      var Lf = this.L_, comp = this.compLad(), lum = this.lumLad();
      var defs = [
        { key: 'lum', name: 'LUM.', noAuto: true, vals: lum.vals.slice(), full: function (i) { return self.whole(lum.ev[i]); } },
        { key: 'iso', name: 'ISO', vals: Lf.iso.vals.slice(), full: function (i) { return self.whole(Lf.iso.ev[i]); } },
        { key: 't', name: 'TIME', vals: Lf.t.vals.slice(), full: function (i) { return self.whole(Lf.t.ev[i]); } },
        { key: 'f', name: 'APER', vals: Lf.f.vals.map(function (v) { return '\u0192/' + v; }), full: function (i) { return self.whole(Lf.f.ev[i]); } },
        { key: 'comp', name: 'EV', vals: comp.vals.slice(), full: function (i) { return self.whole(comp.ev[i]); } }
      ];
      this.panel.innerHTML = '';
      this._sl = {};
      defs.forEach(function (def) {
        var col = document.createElement('div');
        col.style.cssText = 'flex:1; display:flex; flex-direction:column; align-items:center; min-width:0;';
        var nm = document.createElement('div');
        nm.textContent = def.name;
        nm.style.cssText = 'font-size:10px; letter-spacing:1.4px; color:#7c8493; font-weight:600; margin-bottom:8px;';
        col.appendChild(nm);
        var auto = document.createElement('button');
        auto.textContent = 'AUTO';
        auto.style.cssText = 'width:100%; font:600 10px/1 "IBM Plex Mono",monospace; letter-spacing:1px; padding:7px 0; border-radius:9px; border:1px solid #2a2e37; background:#14161b; color:#6b7280; cursor:pointer; transition:.15s;';
        if (def.noAuto) { auto.style.visibility = 'hidden'; auto.style.pointerEvents = 'none'; }
        col.appendChild(auto);
        var track = document.createElement('div');
        track.className = 'et-track';
        track.style.cssText = 'position:relative; width:100%; flex:1; margin:10px 0; min-height:0; cursor:pointer;';
        var rail = document.createElement('div');
        rail.style.cssText = 'position:absolute; left:50%; top:6px; bottom:6px; width:4px; transform:translateX(-50%); background:#23262e; border-radius:3px;';
        track.appendChild(rail);
        var ticks = document.createElement('div'); ticks.style.cssText = 'position:absolute; inset:6px 0;';
        track.appendChild(ticks);
        var ghost = document.createElement('div');
        ghost.style.cssText = 'position:absolute; left:50%; width:26px; height:26px; transform:translate(-50%,-50%); border-radius:50%; border:2px dashed #5b6478; pointer-events:none; display:none; align-items:center; justify-content:center;';
        track.appendChild(ghost);
        var knob = document.createElement('div');
        knob.className = 'et-knob';
        knob.style.cssText = 'position:absolute; left:50%; width:30px; height:30px; transform:translate(-50%,-50%); border-radius:50%; background:linear-gradient(180deg,#3a3f4a,#23262e); border:1px solid #4a505d; box-shadow:0 4px 12px -4px #000, inset 0 1px 0 #565d6b; cursor:grab; display:flex; align-items:center; justify-content:center;';
        var knobDot = document.createElement('div'); knobDot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#F5B544;'; knob.appendChild(knobDot);
        track.appendChild(knob);
        col.appendChild(track);
        var val = document.createElement('div');
        val.className = 'et-num';
        val.style.cssText = 'font-size:13px; font-weight:600; color:#e9ecf1; margin-top:6px; min-height:18px;';
        col.appendChild(val);
        self.panel.appendChild(col);
        self._sl[def.key] = { def: def, auto: auto, track: track, ticks: ticks, ghost: ghost, knob: knob, knobDot: knobDot, val: val };

        var N = def.vals.length;
        for (var i = 0; i < N; i++) {
          var tk = document.createElement('div');
          var isFull = def.full(i);
          tk.style.cssText = 'position:absolute; left:50%; transform:translate(-50%,-50%); width:' + (isFull ? 14 : 8) + 'px; height:2px; background:' + (isFull ? '#3a404b' : '#2a2e37') + '; top:' + ((1 - i / (N - 1)) * 100) + '%;';
          ticks.appendChild(tk);
        }
        if (!def.noAuto) auto.onclick = function () { self.cam[def.key].auto = !self.cam[def.key].auto; self.update(); };
        var setFromY = function (clientY) {
          var r = track.getBoundingClientRect(), pad = 6;
          var frac = 1 - ((clientY - r.top - pad) / (r.height - 2 * pad));
          frac = Math.max(0, Math.min(1, frac));
          var idx = Math.round(frac * (N - 1));
          if (def.key === 'lum') { self.lumIdx = idx; }
          else { self.cam[def.key].idx = idx; self.cam[def.key].auto = false; }
          self.update();
        };
        track.addEventListener('pointerdown', function (e) { self._activeDrag = setFromY; setFromY((e.touches ? e.touches[0] : e).clientY); e.preventDefault(); });
      });
      this.refreshSliders();
    }

    refreshSliders() {
      if (!this._sl) return;
      var accent = this._accent || '#F5B544', self = this;
      var place = function (key, idx, N, isAuto) {
        var r = self._sl[key]; if (!r) return;
        var topPct = (1 - idx / (N - 1)) * 100;
        if (isAuto) {
          r.auto.style.background = accent; r.auto.style.color = '#181818'; r.auto.style.borderColor = accent;
          r.knob.style.display = 'none';
          r.ghost.style.display = 'flex'; r.ghost.style.top = topPct + '%'; r.ghost.style.borderColor = accent; r.ghost.style.opacity = '.95';
        } else {
          r.auto.style.background = '#14161b'; r.auto.style.color = '#6b7280'; r.auto.style.borderColor = '#2a2e37';
          r.knob.style.display = 'flex'; r.knob.style.top = topPct + '%'; r.knobDot.style.background = accent;
          r.ghost.style.display = 'none';
        }
      };
      var Lf = this.L_, comp = this.compLad(), s = this.solved;
      place('iso', this.cam.iso.auto ? s.iso : this.cam.iso.idx, Lf.iso.N, this.cam.iso.auto);
      place('t', this.cam.t.auto ? s.t : this.cam.t.idx, Lf.t.N, this.cam.t.auto);
      place('f', this.cam.f.auto ? s.f : this.cam.f.idx, Lf.f.N, this.cam.f.auto);
      place('comp', this.cam.comp.auto ? comp.center : this.cam.comp.idx, comp.N, this.cam.comp.auto);
      this._sl.iso.val.textContent = Lf.iso.vals[this.cam.iso.auto ? s.iso : this.cam.iso.idx];
      this._sl.t.val.textContent = Lf.t.vals[this.cam.t.auto ? s.t : this.cam.t.idx];
      this._sl.f.val.textContent = '\u0192/' + Lf.f.vals[this.cam.f.auto ? s.f : this.cam.f.idx];
      var cv = this.cam.comp.auto ? 0 : comp.ev[this.cam.comp.idx];
      this._sl.comp.val.textContent = (cv > 0 ? '+' : '') + cv.toFixed(1);
      if (this._sl.lum) {
        var ll = this.lumLad(), lt = (1 - this.lumIdx / (ll.N - 1)) * 100;
        this._sl.lum.knob.style.display = 'flex'; this._sl.lum.knob.style.top = lt + '%'; this._sl.lum.knobDot.style.background = accent;
        this._sl.lum.ghost.style.display = 'none';
        var lv = ll.ev[this.lumIdx];
        this._sl.lum.val.textContent = (lv > 0 ? '+' : '') + lv.toFixed(1);
      }
      this.updateToggle();
    }

    // ---------------- three.js ----------------
    initThree() {
      var THREE = window.THREE, host = this.host;
      var W = host.clientWidth || 600, H = host.clientHeight || 480;
      var scene = new THREE.Scene(); this.scene = scene;
      var cam = new THREE.PerspectiveCamera(42, W / H, 0.1, 100); this.camera = cam;
      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H);
      host.appendChild(renderer.domElement);
      this.renderer = renderer;
      scene.add(new THREE.AmbientLight(0xffffff, 0.9));
      var L = 1.0; this.L = L;
      this.center = new THREE.Vector3(L * 0.5, L * 0.42, L * 0.5);

      var axMat = function (c) { return new THREE.MeshBasicMaterial({ color: c }); };
      var mkAxis = function (dir, len, color) {
        var m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 12), axMat(color));
        if (dir === 'x') { m.rotation.z = -Math.PI / 2; m.position.set(len / 2, 0, 0); }
        if (dir === 'y') { m.position.set(0, len / 2, 0); }
        if (dir === 'z') { m.rotation.x = Math.PI / 2; m.position.set(0, 0, len / 2); }
        scene.add(m);
        var cone = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 16), axMat(color));
        if (dir === 'x') { cone.rotation.z = -Math.PI / 2; cone.position.set(len, 0, 0); }
        if (dir === 'y') { cone.position.set(0, len, 0); }
        if (dir === 'z') { cone.rotation.x = Math.PI / 2; cone.position.set(0, 0, len); }
        scene.add(cone);
      };
      mkAxis('x', L * 1.12, 0x6f7788); mkAxis('y', L * 1.12, 0x6f7788); mkAxis('z', L * 1.12, 0x6f7788);

      var grid = new THREE.GridHelper(L, 8, 0x2c313b, 0x21252d);
      grid.position.set(L / 2, 0, L / 2);
      scene.add(grid); this.grid = grid;

      this.addLabel('ISO', new THREE.Vector3(0, L * 1.2, 0), 0xc9d0db, 0.13);
      this.addLabel('T', new THREE.Vector3(L * 1.18, 0, 0), 0xc9d0db, 0.13);
      this.addLabel('F', new THREE.Vector3(0, 0, L * 1.18), 0xc9d0db, 0.13);
      this.buildTickLabels();

      var dashMat = new THREE.LineDashedMaterial({ color: 0x5b6478, dashSize: 0.03, gapSize: 0.022 });
      var dropMat = new THREE.LineBasicMaterial({ color: 0x8a93a4, transparent: true, opacity: 0.7 });
      this.dropLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), dropMat); scene.add(this.dropLine);
      this.projF = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), dashMat); scene.add(this.projF);
      this.projT = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), dashMat); scene.add(this.projT);
      this.floorDot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 16), new THREE.MeshBasicMaterial({ color: 0x5b6478 })); scene.add(this.floorDot);

      this.marker = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 24), new THREE.MeshBasicMaterial({ color: 0x7ee0a6 })); scene.add(this.marker);
      this.markerGlow = new THREE.Mesh(new THREE.SphereGeometry(0.055, 24, 24), new THREE.MeshBasicMaterial({ color: 0x7ee0a6, transparent: true, opacity: 0.18 })); scene.add(this.markerGlow);

      this.buildPhoto();

      this.az = -0.7; this.el = 0.5; this.dist = 2.7;
      this.bindOrbit();

      var self = this;
      this._ro = new ResizeObserver(function () { var w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; cam.aspect = w / h; cam.updateProjectionMatrix(); renderer.setSize(w, h); });
      this._ro.observe(host);

      this.applyProps();
      this.loop();
    }

    buildTickLabels() {
      var THREE = window.THREE, L = this.L, Lf = this.L_, self = this;
      (this._tickLabels || []).forEach(function (s) { self.scene.remove(s); if (s.material.map) s.material.map.dispose(); s.material.dispose(); });
      this._tickLabels = [];
      var add = function (t, p, c, sc) { self._tickLabels.push(self.addLabel(t, p, c, sc)); };
      Lf.iso.vals.forEach(function (v, i) { if (self.whole(Lf.iso.ev[i])) add(String(v), new THREE.Vector3(-0.06, i / (Lf.iso.N - 1) * L, -0.02), 0x7c8493, 0.07); });
      Lf.f.vals.forEach(function (v, i) { if (self.whole(Lf.f.ev[i])) add('\u0192/' + v, new THREE.Vector3(-0.02, -0.045, i / (Lf.f.N - 1) * L), 0x7c8493, 0.06); });
      Lf.t.vals.forEach(function (v, i) { if (self.whole(Lf.t.ev[i])) add(v, new THREE.Vector3(i / (Lf.t.N - 1) * L, -0.045, -0.02), 0x7c8493, 0.06); });
    }

    addLabel(text, pos, color, scale) {
      var THREE = window.THREE;
      var cnv = document.createElement('canvas'), S = 256; cnv.width = S; cnv.height = 128;
      var x = cnv.getContext('2d');
      x.fillStyle = '#' + color.toString(16).padStart(6, '0');
      x.font = '600 64px "IBM Plex Mono", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(text, S / 2, 64);
      var tex = new THREE.CanvasTexture(cnv); tex.anisotropy = 4;
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      sp.position.copy(pos); sp.scale.set(scale * 2, scale, 1); sp.renderOrder = 10;
      this.scene.add(sp);
      return sp;
    }

    buildPhoto() {
      var THREE = window.THREE;
      var sceneUrl = this.getAttribute('scene') || DEFAULT_SCENE;
      var self = this;
      var tex = new THREE.TextureLoader().load(sceneUrl, function () { self._texReady = true; });
      tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
      var uniforms = { uTex: { value: tex }, uExposure: { value: 1.8 }, uDof: { value: 0.0 }, uFocus: { value: 0.42 }, uMotion: { value: 0.0 }, uNoise: { value: 0.0 }, uSeed: { value: 0.0 } };
      this.photoUniforms = uniforms;
      var mat = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
        fragmentShader: [
          'precision highp float; varying vec2 vUv;',
          'uniform sampler2D uTex; uniform float uExposure,uDof,uFocus,uMotion,uNoise,uSeed;',
          'float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }',
          'void main(){',
          '  float depth=texture2D(uTex,vUv).a;',
          '  float dofR=abs(depth-uFocus)*uDof;',
          '  const int N=24; vec3 col=vec3(0.0);',
          '  for(int i=0;i<N;i++){',
          '    float fi=float(i); float ang=fi*2.399963; float r=sqrt((fi+0.5)/float(N));',
          '    vec2 disk=vec2(cos(ang),sin(ang))*r;',
          '    vec2 off=disk*dofR+vec2(disk.x*uMotion,0.0);',
          '    col+=texture2D(uTex,vUv+off).rgb;',
          '  }',
          '  col/=float(N);',
          '  col*=uExposure;',
          '  col=vec3(1.0)-exp(-col);',
          '  float n=hash(vUv*vec2(900.0,1180.0)+uSeed)-0.5;',
          '  col+=n*uNoise;',
          '  col=clamp(col,0.0,1.0);',
          '  gl_FragColor=vec4(col,1.0);',
          '}'
        ].join('\n'),
        side: THREE.DoubleSide
      });
      var aspect = 900 / 1180, h = 0.92, w = h * aspect;
      this.photo = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      this.scene.add(this.photo);
      var fr = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.03, h + 0.03), new THREE.MeshBasicMaterial({ color: 0xe9ecf1 }));
      this.photoFrame = fr; fr.renderOrder = -1; this.photo.add(fr); fr.position.z = -0.002;
    }

    bindOrbit() {
      var el = this.renderer.domElement, self = this, drag = false, px = 0, py = 0;
      el.style.touchAction = 'none';
      el.addEventListener('pointerdown', function (e) { drag = true; px = e.clientX; py = e.clientY; });
      this._obMove = function (e) { if (!drag) return; self.az -= (e.clientX - px) * 0.008; self.el += (e.clientY - py) * 0.008; self.el = Math.max(-0.2, Math.min(1.4, self.el)); px = e.clientX; py = e.clientY; };
      this._obUp = function () { drag = false; };
      window.addEventListener('pointermove', this._obMove);
      window.addEventListener('pointerup', this._obUp);
      el.addEventListener('wheel', function (e) { self.dist *= (1 + Math.sign(e.deltaY) * 0.08); self.dist = Math.max(1.6, Math.min(5, self.dist)); e.preventDefault(); }, { passive: false });
    }

    loop() {
      var self = this;
      this._raf = requestAnimationFrame(function () { self.loop(); });
      if (this._spin) this.az += 0.0025;
      var c = this.center, d = this.dist;
      this.camera.position.set(
        c.x + d * Math.cos(this.el) * Math.sin(this.az),
        c.y + d * Math.sin(this.el),
        c.z + d * Math.cos(this.el) * Math.cos(this.az)
      );
      this.camera.lookAt(c);
      if (this._photoBillboard && this.photo) this.photo.quaternion.copy(this.camera.quaternion);
      this.renderer.render(this.scene, this.camera);
    }

    // ---------------- update ----------------
    update() {
      this.solve();
      this.refreshSliders();
      this.place3D();
      var mi = this.modeInfo();
      var raw = this.solved.raw, target = this.solved.target, err = raw - target;
      if (Math.abs(err) < 0.05) err = 0;
      var accent = this._accent || '#F5B544';
      var evColor = '#7ee0a6', errText = '', markerColor = accent;
      if (err === 0) {
        errText = (mi.kind === 3 && Math.abs(this.lum) < 0.01) ? 'Sunny 16 reference \u2014 f/16, ISO 100, 1/100.' : 'Correct exposure for the current light.';
      } else if (err > 0) {
        evColor = '#ffb454';
        errText = 'Over by ' + err.toFixed(1) + ' EV \u2014 too much light reaches the sensor, photo is brighter.';
      } else {
        evColor = '#7aa2ff';
        errText = 'Under by ' + (-err).toFixed(1) + ' EV \u2014 too little light, photo is darker.';
      }
      var evText = (err > 0 ? '+' : '') + err.toFixed(1) + ' EV';
      this.modeLabelEl.textContent = mi.label;
      this.evTextEl.textContent = evText; this.evTextEl.style.color = evColor;
      this.errTextEl.textContent = errText;
      if (this.legendEl) { this.legendEl.style.background = markerColor; this.legendEl.style.boxShadow = '0 0 10px ' + markerColor; }
      if (this.marker) {
        var col = new window.THREE.Color(markerColor);
        this.marker.material.color.copy(col); this.markerGlow.material.color.copy(col);
      }
      var ci = this.curIdx(), Lf = this.L_;
      this.dispatchEvent(new CustomEvent('change', { detail: {
        iso: Lf.iso.vals[ci.iso], f: 'f/' + Lf.f.vals[ci.f], t: Lf.t.vals[ci.t], ev: evText, mode: mi.label
      } }));
    }

    curIdx() {
      return {
        iso: this.cam.iso.auto ? this.solved.iso : this.cam.iso.idx,
        f: this.cam.f.auto ? this.solved.f : this.cam.f.idx,
        t: this.cam.t.auto ? this.solved.t : this.cam.t.idx
      };
    }

    place3D() {
      if (!this.scene) return;
      var THREE = window.THREE, L = this.L, ci = this.curIdx(), Lf = this.L_;
      var tx = ci.t / (Lf.t.N - 1) * L, iy = ci.iso / (Lf.iso.N - 1) * L, fz = ci.f / (Lf.f.N - 1) * L;
      var P = new THREE.Vector3(tx, iy, fz);
      this.marker.position.copy(P); this.markerGlow.position.copy(P);
      var F0 = new THREE.Vector3(tx, 0, fz);
      this.floorDot.position.copy(F0);
      this.setLine(this.dropLine, P, F0);
      this.setLine(this.projF, F0, new THREE.Vector3(0, 0, fz));
      this.setLine(this.projT, F0, new THREE.Vector3(tx, 0, 0));

      var self = this;
      var ctl = ['iso', 'f', 't'].filter(function (k) { return !self.cam[k].auto; });
      var normal;
      if (ctl.length === 1) normal = ctl[0];
      else if (ctl.length === 2) normal = ['iso', 'f', 't'].find(function (k) { return self.cam[k].auto; });
      else normal = 'iso';

      var ph = this.photo, half = L / 2;
      ph.rotation.set(0, 0, 0);
      if (normal === 'iso') { ph.rotation.x = -Math.PI / 2; ph.position.set(half, iy + 0.001, half); }
      else if (normal === 't') { ph.rotation.y = Math.PI / 2; ph.position.set(tx, half, half); }
      else { ph.position.set(half, half, fz); }
      this._photoBillboard = false;

      var u = this.photoUniforms;
      var fev = Lf.f.ev[ci.f], tev = Lf.t.ev[ci.t], isoev = Lf.iso.ev[ci.iso];
      u.uExposure.value = 1.8 * Math.pow(2, this.solved.raw - this.solved.target);
      var openness = Math.max(0, Math.min(1, fev / 7));
      u.uDof.value = Math.pow(openness, 1.4) * 0.055;
      var secs = (1 / 100) * Math.pow(2, tev);
      u.uMotion.value = Math.min(0.28, secs * 0.24);
      u.uNoise.value = isoev * 0.028;
      u.uSeed.value = isoev * 13.7 + 1.0;
    }

    setLine(line, a, b) {
      var pos = line.geometry.attributes.position;
      pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z); pos.needsUpdate = true;
      if (line.material.isLineDashedMaterial) line.computeLineDistances();
    }
  }

  if (!customElements.get('exposure-triangle')) customElements.define('exposure-triangle', ExposureTriangle);

  window.ExposureTriangle = {
    mount: function (target, opts) {
      opts = opts || {};
      var el = document.createElement('exposure-triangle');
      if (opts.accent) el.setAttribute('accent', opts.accent);
      if (opts.scene) el.setAttribute('scene', opts.scene);
      if (opts.floorGrid === false) el.setAttribute('floor-grid', 'false');
      if (opts.spin) el.setAttribute('spin', '');
      if (opts.threeSrc) el.setAttribute('three-src', opts.threeSrc);
      if (opts.height) el.style.height = opts.height;
      var host = typeof target === 'string' ? document.querySelector(target) : target;
      host.appendChild(el);
      return el;
    }
  };
})();
