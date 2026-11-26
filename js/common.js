'use strict';
/* Fotowand: gemeinsame Hilfen (Speicher, QR, Zufall, Sprachausgabe) */
window.FW = window.FW || {};
(function (FW) {
  FW.VERSION = '0.1.0';
  FW.PREFIX = 'fotowand-kme-';
  FW.CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  FW.qs = new URLSearchParams(location.search);
  // ?net=bc: Testbetrieb ohne Internet, alle Seiten im selben Browser (BroadcastChannel)
  FW.NET = FW.qs.get('net') === 'bc' ? 'bc' : 'peer';
  FW.netQuery = FW.NET === 'bc' ? '?net=bc' : '';
  FW.hashParams = () => new URLSearchParams(location.hash.replace(/^#/, ''));

  FW.genCode = function (n) {
    n = n || 4; let s = '';
    for (let i = 0; i < n; i++) s += FW.CODE_CHARS[Math.floor(Math.random() * FW.CODE_CHARS.length)];
    return s;
  };
  FW.rid = function (n) {
    n = n || 8; const c = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = '';
    for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  };
  FW.ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  FW.pick = arr => arr[Math.floor(Math.random() * arr.length)];
  FW.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  FW.store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* egal */ } }
  };

  FW.Emitter = class {
    constructor() { this._h = {}; }
    on(e, f) { (this._h[e] = this._h[e] || []).push(f); return this; }
    emit(e, ...a) { (this._h[e] || []).slice().forEach(f => { try { f(...a); } catch (err) { console.error(err); } }); }
  };

  FW.makeQR = function (url) {
    try {
      const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
      const n = qr.getModuleCount(), cell = 8, q = 3, size = (n + q * 2) * cell;
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#0D2B4E';
      for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) g.fillRect((k + q) * cell, (r + q) * cell, cell, cell);
      return c;
    } catch (e) { console.error(e); return null; }
  };

  FW.download = function (name, text, type) {
    const blob = text instanceof Blob ? text : new Blob([text], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  FW.fmtTime = ts => ts ? new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';
  FW.fmtDate = ts => ts ? new Date(ts).toLocaleDateString('de-DE') + ' ' + FW.fmtTime(ts) : '–';

  // Pseudonyme: Adjektiv + Tier + Zahl, nur männliche Artikel ("Blauer Falke")
  // Die Farbe im Namen ist auch die Farbe auf dem iPad und der Rahmen um das Foto
  const FARBE = { Blauer: '#4DB2E6', Grüner: '#46A84A', Hellgrüner: '#A6D27A', Gelber: '#FFD100', Oranger: '#F39200', Roter: '#EF6B45', Silberner: '#B9C1C8' };
  const ADJ = Object.keys(FARBE);
  FW.kidColor = name => FARBE[String(name).split(' ')[0]] || null;
  const NOUN = ['Affe', 'Falke', 'Fuchs', 'Hase', 'Igel', 'Löwe', 'Hund', 'Panda', 'Frosch', 'Delfin', 'Papagei', 'Pinguin', 'Tiger', 'Bär', 'Adler', 'Wolf'];
  FW.pseudonym = () => FW.pick(ADJ) + ' ' + FW.pick(NOUN) + ' ' + FW.ri(10, 99);


  /* ---------- Symbole (schlichte Linien, eigene Zeichnung) ---------- */
  const IC = {
    speaker: '<path d="M4 9.5v5h4l5 4v-13l-5 4z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    stop: '<rect class="f" x="6" y="6" width="12" height="12" rx="2.5"/>',
    rec: '<circle class="f" cx="12" cy="12" r="6.5"/>',
    play: '<path class="f" d="M8 4.5v15l12-7.5z"/>',
    pause: '<path d="M8.5 5v14M15.5 5v14"/>',
    check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    up: '<path d="M5 15l7-7 7 7"/>',
    down: '<path d="M5 9l7 7 7-7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4h5v3M6.5 7l1 13h9l1-13"/>',
    sliders: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.6"/><circle cx="8" cy="17" r="2.6"/>',
    qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h3v3M20.5 14v.1M14 20.5h.1M17 20.5h3.5V17"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17.5" cy="9" r="2.4"/><path d="M17.5 14c2.4 0 4 1.9 4 4.5"/>',
    upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle class="f" cx="9" cy="9" r="1.2"/><circle class="f" cx="15" cy="15" r="1.2"/><circle class="f" cx="15" cy="9" r="1.2"/><circle class="f" cx="9" cy="15" r="1.2"/>',
    hourglass: '<path d="M7 3h10M7 21h10M8 3v3.5l4 5.5-4 5.5V21M16 3v3.5L12 12l4 5.5V21"/>',
    send: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    pen: '<path d="M4 20l1-4.5L16 4.5l3.5 3.5L8.5 19z"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.1M4 12h.1M4 18h.1"/>',
    chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    text: '<path d="M5 6h14M5 11h14M5 16h9"/>',
    camera: '<path d="M4 8.5h3.2l1.6-2.5h6.4l1.6 2.5H20v10.5H4z"/><circle cx="12" cy="13.5" r="3.6"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/>',
    shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.1"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'
  };
  // Bild verkleinern und neu als JPEG kodieren. Das entfernt auch versteckte Daten wie GPS-Position (EXIF).
  FW.shrinkImage = async function (file, max, q) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      bmp = await new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = rej; im.src = u; });
    }
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(res, 'image/jpeg', q || 0.82));
  };
  // Das Auswahlfeld bleibt fest in der Seite. Ein loses Feld meldet auf dem iPad das Foto nicht zuverlässig.
  let picker = null;
  FW.pickImage = function (cb) {
    if (picker) picker.remove();
    const i = picker = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.className = 'dateiwahl';
    i.setAttribute('capture', 'environment'); // öffnet auf dem iPad direkt die Kamera
    i.tabIndex = -1; i.setAttribute('aria-hidden', 'true');
    i.onchange = () => { const f = i.files && i.files[0]; if (f) cb(f); };
    document.body.appendChild(i); i.click();
  };
  FW.fillIcons = () => document.querySelectorAll('[data-ic]').forEach(e => { e.innerHTML = FW.icon(e.dataset.ic); });
  document.addEventListener('DOMContentLoaded', FW.fillIcons);
  FW.icon = (name, extra) => '<svg class="symbol' + (extra ? ' ' + extra : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (IC[name] || '') + '</svg>';

  // Farben für Kinder (Olympia-72-Palette aus design.css), damit man Antworten schneller zuordnen kann
  const PAL = ['#4DB2E6', '#46A84A', '#F39200', '#A6D27A', '#FFD100', '#B9C1C8', '#0067B1'];
  FW.colorOf = function (id) { let h = 0; const s = String(id); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return PAL[h % PAL.length]; };

  // Einziger Ort für den Namen der App (Arbeitstitel)
  FW.NAME = 'Fotowand';
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-name]').forEach(e => { e.textContent = FW.NAME; });
    document.title = document.title.replace('Fotowand', FW.NAME);
  });
  Object.assign(IC, {
    full: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    unfull: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
    stopp: '<rect x="5" y="5" width="14" height="14" rx="3"/>',
    compare: '<rect x="3.5" y="5" width="7.5" height="14" rx="1.5"/><rect x="13" y="5" width="7.5" height="14" rx="1.5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M4 4l16 16M9.5 6a10 10 0 0 1 2.5-.5c6 0 9.5 6.500 9.5 6.500a17 17 0 0 1-3 3.8M6.5 7.800A16 16 0 0 0 2.500 12S6 18.500 12 18.500a9 9 0 0 0 3.500-.700"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    rotate: '<path d="M19 12a7 7 0 1 1-2.2-5.1M19 4v4h-4"/>',
    undo: '<path d="M9 7L4.5 11.5 9 16M5 11.5h9a5 5 0 0 1 0 10h-2"/>',
    remote: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/>'
  });
  // Bild mit Markierungen als SVG. So passen Foto und Striche in jeder Größe genau übereinander.
  const NS = 'http://www.w3.org/2000/svg';
  FW.PEN = ['#F39200', '#FFD100', '#0067B1', '#46A84A'];
  FW.line = function (p, st) {
    const l = document.createElementNS(NS, 'polyline'), pts = st.p.length > 1 ? st.p : [st.p[0], st.p[0]];
    l.setAttribute('points', pts.map(a => (a[0] * p.w) + ',' + (a[1] * p.h)).join(' '));
    l.setAttribute('fill', 'none'); l.setAttribute('stroke', FW.PEN[st.c] || FW.PEN[0]);
    l.setAttribute('stroke-width', Math.max(p.w, p.h) / 100); l.setAttribute('stroke-linecap', 'round'); l.setAttribute('stroke-linejoin', 'round');
    return l;
  };
  FW.picture = function (p) {
    const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 ' + p.w + ' ' + p.h); s.setAttribute('class', 'bildsvg');
    s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'Foto');
    const i = document.createElementNS(NS, 'image'); i.setAttribute('href', p.url); i.setAttribute('width', p.w); i.setAttribute('height', p.h); s.appendChild(i);
    (p.strokes || []).forEach(st => s.appendChild(FW.line(p, st)));
    return s;
  };
  // Zeichnen mit Finger, Stift oder Maus. done(strich) wird beim Loslassen aufgerufen.
  FW.drawable = function (svg, p, color, done) {
    let st = null, el = null;
    const pos = e => { const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse()); const c = v => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000; return [c(q.x / p.w), c(q.y / p.h)]; };
    svg.classList.add('malen');
    svg.onpointerdown = e => { e.preventDefault(); svg.setPointerCapture(e.pointerId); st = { c: color(), p: [pos(e)] }; el = FW.line(p, st); svg.appendChild(el); };
    svg.onpointermove = e => { if (!st || st.p.length > 400) return; st.p.push(pos(e)); const n = FW.line(p, st); el.replaceWith(n); el = n; };
    svg.onpointerup = svg.onpointercancel = () => { if (st) { const s = st; st = null; done(s); } };
  };
  // Vollbild. Wo das Gerät es nicht kann (z. B. iPhone), gibt es keinen Knopf.
  const root = document.documentElement;
  FW.canFull = !!(root.requestFullscreen || root.webkitRequestFullscreen);
  const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function paintFull(b) { b.innerHTML = FW.icon(isFull() ? 'unfull' : 'full'); b.setAttribute('aria-label', isFull() ? 'Vollbild beenden' : 'Vollbild'); }
  FW.fullBtn = function () {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'knopf leise vollbild'; paintFull(b);
    b.onclick = () => {
      const f = isFull() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document) : (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
      if (f && f.catch) f.catch(() => {});
    };
    return b;
  };
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => document.querySelectorAll('.vollbild').forEach(paintFull)));
  document.addEventListener('DOMContentLoaded', () => { const k = document.querySelector('.kind .kopf, .fern .kopf'); if (k && FW.canFull) k.appendChild(FW.fullBtn()); });
  FW.btn = function (ic, text, fn, cls) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'knopf ' + (cls || 'leise');
    b.innerHTML = (ic ? FW.icon(ic) : '') + (text ? '<span>' + FW.esc(text) + '</span>' : ''); b.onclick = fn; return b;
  };

  /* ---------- Sprachausgabe (offline, Stimme des Geräts) ---------- */
  FW.tts = {
    ok: 'speechSynthesis' in window,
    voice: null,
    pickVoice() {
      if (!this.ok) return;
      const vs = speechSynthesis.getVoices().filter(v => /^de/i.test(v.lang));
      if (!vs.length) return;
      const score = v => (/enhanced|premium|erweitert/i.test(v.name) ? 3 : 0) + (/^de[-_]DE/i.test(v.lang) ? 2 : 0) + (v.localService ? 1 : 0);
      this.voice = vs.sort((a, b) => score(b) - score(a))[0];
    },
    // parts: Liste von Texten, werden nacheinander mit kleiner Pause gesprochen
    speak(parts, rate, onEnd) {
      if (!this.ok) { onEnd && onEnd(); return; }
      this.stop();
      this.pickVoice();
      const list = (Array.isArray(parts) ? parts : [parts]).map(s => String(s || '').trim()).filter(Boolean);
      if (!list.length) { onEnd && onEnd(); return; }
      const token = this._tok = (this._tok || 0) + 1;
      list.forEach((t, i) => {
        const u = new SpeechSynthesisUtterance(t);
        u.lang = 'de-DE'; if (this.voice) u.voice = this.voice;
        u.rate = rate || 0.9;
        if (i === list.length - 1) u.onend = u.onerror = () => { if (this._tok === token) onEnd && onEnd(); };
        speechSynthesis.speak(u);
      });
    },
    stop() { if (this.ok) { this._tok = (this._tok || 0) + 1; try { speechSynthesis.cancel(); } catch (e) { /* egal */ } } }
  };
  if (FW.tts.ok) { speechSynthesis.onvoiceschanged = () => FW.tts.pickVoice(); FW.tts.pickVoice(); }
})(window.FW);
