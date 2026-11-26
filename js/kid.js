'use strict';
/* iPad der Kinder: Foto machen, drehen, zuschneiden, senden. */
(function () {
  const $ = id => document.getElementById(id), btn = FW.btn;
  let me = FW.store.get('fw.kid', null);
  let net = null, info = { task: '', stopped: false }, draft = null, last = null, ended = false, loading = false, tries = 0;
  const room = (FW.hashParams().get('r') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const TEXT = { send: 'Wird gesendet …', wait: 'Angekommen bei der Lehrkraft.', shown: 'Dein Foto ist an der Tafel.', removed: 'Dein Foto ist nicht mehr an der Tafel.', stopped: 'Gerade werden keine Fotos angenommen.', refused: 'Das Foto wurde nicht angenommen.' };

  function connect() {
    net = FW.joinRoom(me.room, {
      onStatus(s) { $('stand').textContent = s === 'open' ? 'verbunden' : s === 'connecting' ? 'verbinde …' : 'getrennt'; },
      onOpen() { net.send({ t: 'hello', pid: me.pid, name: me.name }); if (last && last.s === 'send') transmit(); },
      onData(d) {
        if (d.t === 'info') { info = d; render(); }
        else if (d.t === 'status' && last && d.id === last.id) { last.s = d.s; render(); }
        else if (d.t === 'end') { ended = true; net.close(); FW.store.del('fw.kid'); draft = last = null; render(); }
      }
    });
  }
  const transmit = () => net.send({ t: 'photo', id: last.id, buf: last.buf, w: last.w, h: last.h });

  function take() {
    FW.pickImage(async f => {
      loading = true; draft = null; render();
      try {
        const blob = await FW.shrinkImage(f, 1600, 0.9), img = await createImageBitmap(blob);
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
        draft = { c, crop: null };
      } catch (e) { alert('Das Foto konnte nicht gelesen werden.'); }
      loading = false; render();
    });
  }
  function rotate() {
    const a = draft.c, c = document.createElement('canvas'); c.width = a.height; c.height = a.width;
    const g = c.getContext('2d'); g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(a, 0, 0);
    draft = { c, crop: null }; render();
  }
  // Zuschneiden: mit dem Finger ein Rechteck über das Wichtige ziehen
  function cropper() {
    const src = draft.c, c = el('canvas', 'schnitt'); c.width = src.width; c.height = src.height;
    c.setAttribute('aria-label', 'Dein Foto. Ziehe ein Rechteck, um es zuzuschneiden.');
    const paint = () => {
      const g = c.getContext('2d'), r = draft.crop; g.drawImage(src, 0, 0); if (!r) return;
      g.fillStyle = 'rgba(13,43,78,.6)'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      g.strokeStyle = '#FFD100'; g.lineWidth = c.width / 150; g.strokeRect(r.x, r.y, r.w, r.h);
    };
    let a = null;
    const pos = e => { const b = c.getBoundingClientRect(); const k = (v, m) => Math.round(Math.min(m, Math.max(0, v))); return { x: k((e.clientX - b.left) / b.width * c.width, c.width), y: k((e.clientY - b.top) / b.height * c.height, c.height) }; };
    c.onpointerdown = e => { e.preventDefault(); c.setPointerCapture(e.pointerId); a = pos(e); };
    c.onpointermove = e => { if (!a) return; const b = pos(e); draft.crop = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; paint(); };
    c.onpointerup = c.onpointercancel = () => { a = null; const r = draft.crop; if (r && (r.w < c.width / 8 || r.h < c.height / 8)) draft.crop = null; paint(); };
    paint(); return c;
  }
  async function send() {
    const s = draft.c, r = draft.crop || { x: 0, y: 0, w: s.width, h: s.height }, k = Math.min(1, 1280 / Math.max(r.w, r.h));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(r.w * k)); c.height = Math.max(1, Math.round(r.h * k));
    c.getContext('2d').drawImage(s, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.8));
    last = { id: FW.rid(10), buf: await blob.arrayBuffer(), w: c.width, h: c.height, s: 'send' };
    draft = null; tries = 0; render(); if (net.open) transmit();
  }
  // Ohne Bestätigung der Tafel erneut senden. Bleibt sie aus, die Verbindung neu aufbauen (nach der Kamera oft nötig).
  setInterval(() => {
    if (ended || !net || !last || last.s !== 'send') return;
    if (++tries % 3 === 0) { net.close(); connect(); } else if (net.open) transmit();
  }, 5000);
  function render() {
    const app = $('app'); app.innerHTML = ''; $('name').textContent = me ? me.name : '';
    if (ended) { app.append(el('h2', '', 'Die Runde ist beendet.'), el('p', '', 'Danke!')); return; }
    if (!me) {
      const row = el('form', 'feld'), i = el('input'); i.type = 'text'; i.maxLength = 4; i.autocapitalize = 'characters'; i.setAttribute('aria-label', 'Code'); const ok = btn('check', 'Los', null, ''); ok.type = 'submit';
      row.onsubmit = e => { e.preventDefault(); const r = i.value.toUpperCase().replace(/[^A-Z]/g, ''); if (r.length === 4) join(r); };
      row.append(i, ok); app.append(el('h2', '', 'Gib den Code von der Tafel ein.'), row); return;
    }
    if (info.task) {
      const h = el('div', 'reihe'); h.append(el('p', 'auftrag', info.task));
      if (FW.tts.ok) h.append(btn('speaker', 'Vorlesen', () => FW.tts.speak(info.task)));
      app.append(h);
    }
    if (loading) app.append(el('h2', '', 'Foto wird geladen …'));
    else if (draft) {
      const box = el('div'); box.appendChild(cropper());
      const row = el('div', 'reihe'), go = btn('send', 'Senden', send, 'gruen'); go.disabled = info.stopped;
      row.append(btn('camera', 'Nochmal', take), btn('rotate', 'Drehen', rotate), btn('image', 'Ganzes Bild', () => { draft.crop = null; render(); }), go);
      app.append(box, el('p', '', 'Zuschneiden: Ziehe mit dem Finger ein Rechteck.'), row);
    } else {
      const b = btn('camera', 'Foto', take, 'riesig'); b.disabled = info.stopped; app.append(b);
      if (last) app.append(el('h2', '', TEXT[last.s] || ''));
    }
    if (info.stopped) app.append(el('p', 'hinweis', TEXT.stopped));
    app.append(el('p', 'hinweis', 'Keine Gesichter und keine Namen fotografieren.'));
  }
  function join(r) {
    if (!me || me.room !== r) me = { room: r, pid: FW.rid(10), name: FW.pseudonym() };
    FW.store.set('fw.kid', me); connect(); render();
  }
  document.addEventListener('DOMContentLoaded', () => { if (room) join(room); else if (me) join(me.room); else render(); });
  addEventListener('hashchange', () => location.reload());
})();
