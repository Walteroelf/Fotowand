'use strict';
/* Fernbedienung: Fotos prüfen und freigeben, Tafel steuern. Fotos bleiben nur im Arbeitsspeicher. */
(function () {
  const $ = id => document.getElementById(id), btn = FW.btn;
  const q = FW.hashParams(), room = (q.get('r') || '').replace(/[^A-Z]/g, '').slice(0, 4), key = q.get('k') || '';
  let me = FW.store.get('fw.remote', null);
  if (room && (!me || me.room !== room || (key && me.key !== key))) me = { room, key, token: '' };
  let net = null, st = null, mode = 'connect', num = 0, openId = null, draw = false, pen = 0;
  const urls = {}, asked = new Set();
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const cmd = (c, id, extra) => net.send(Object.assign({ t: 'cmd', c, id }, extra));
  const save = () => FW.store.set('fw.remote', me);

  function connect() {
    net = FW.joinRoom(me.room, {
      onStatus(s) { $('stand').textContent = s === 'open' ? 'verbunden' : s === 'connecting' ? 'verbinde …' : 'getrennt'; if (s !== 'open' && mode === 'ready') { mode = 'connect'; render(); } },
      onOpen() { asked.clear(); net.send(me.token ? { t: 'auth', token: me.token } : { t: 'pair', key: me.key }); },
      onData(d) {
        if (d.t === 'confirm') { mode = 'confirm'; num = d.num | 0; }
        else if (d.t === 'paired') { me.token = d.token; save(); mode = 'ready'; }
        else if (d.t === 'no') { mode = 'no'; st = null; me.token = ''; save(); net.close(); forget([]); }
        else if (d.t === 'img') urls[d.id] = URL.createObjectURL(new Blob([d.buf], { type: 'image/jpeg' }));
        else if (d.t === 'state') { st = d; forget(d.photos.map(p => p.id)); d.photos.forEach(p => { if (!urls[p.id] && !asked.has(p.id)) { asked.add(p.id); net.send({ t: 'need', id: p.id }); } }); }
        else return;
        render();
      }
    });
  }
  function forget(keep) { for (const id in urls) if (!keep.includes(id)) { URL.revokeObjectURL(urls[id]); delete urls[id]; } }
  const full = p => Object.assign({}, p, { url: urls[p.id] });

  function render() {
    const app = $('app'); app.innerHTML = '';
    if (mode === 'confirm') { app.append(el('p', '', 'Tippe an der Tafel auf diese Zahl:'), el('p', 'zahl', String(num))); return; }
    if (mode === 'no') { app.append(el('h2', '', 'Nicht gekoppelt.'), el('p', '', 'Zeige an der Tafel den Code für die Fernbedienung und scanne ihn neu.')); return; }
    if (mode !== 'ready' || !st) { app.append(el('h2', '', 'Verbinde mit der Tafel …'), el('p', '', 'Die Tafel-Seite muss offen sein.')); return; }
    const bar = el('div', 'reihe');
    bar.append(btn(st.stopped ? 'play' : 'stopp', st.stopped ? 'Fotos annehmen' : 'Fotos stoppen', () => cmd('stopped', '', { v: !st.stopped }), st.stopped ? 'orange' : 'leise'),
      btn(st.covered ? 'eye' : 'eyeoff', st.covered ? 'Aufdecken' : 'Verdecken', () => cmd('covered', '', { v: !st.covered }), st.covered ? 'gelb' : 'leise'),
      btn('dice', 'Zufall', () => cmd('random')));
    if (st.big.length) bar.append(btn('close', 'Großansicht schließen', () => cmd('close')));
    app.append(bar);
    const wait = st.photos.filter(p => p.state === 'wait'), wall = st.photos.filter(p => p.state === 'wall');
    // Das älteste wartende Foto groß zum Prüfen
    if (wait.length) {
      const p = wait[0]; app.append(el('h2', '', 'Prüfen (' + wait.length + ' warten)'));
      const v = el('div', 'vorschau gerahmt'); v.style.borderColor = FW.kidColor(p.name) || ''; if (urls[p.id]) v.appendChild(FW.picture(full(p))); else v.textContent = 'Foto lädt …'; app.append(v);
      if (st.names) app.append(el('p', '', p.name));
      const r = el('div', 'reihe'), yes = btn('check', 'Zeigen', () => cmd('approve', p.id), 'gruen'); yes.disabled = !urls[p.id];
      r.append(btn('trash', 'Verwerfen', () => cmd('remove', p.id), 'orange'), yes); app.append(r);
    } else app.append(el('p', '', 'Kein Foto wartet.'));
    if (wall.length) {
      app.append(el('h2', '', 'An der Tafel'));
      const g = el('div', 'raster');
      wall.forEach(p => { const k = el('button', 'kachel'), b = el('div', 'bild'); if (urls[p.id]) b.appendChild(FW.picture(full(p))); k.appendChild(b); k.style.borderColor = FW.kidColor(p.name) || ''; if (st.names) k.appendChild(el('span', '', p.name)); k.onclick = () => { openId = p.id; draw = false; detail(); }; g.appendChild(k); });
      app.append(g);
    }
    if ($('dlg').open) detail();
  }
  function detail() {
    const d = $('dlg'), p = st && st.photos.find(x => x.id === openId);
    if (!p || !urls[p.id]) { if (d.open) d.close(); return; }
    const box = el('div', 'inhalt'), v = el('div', 'vorschau'), s = FW.picture(full(p)), r = el('div', 'reihe'); v.appendChild(s);
    if (draw) FW.drawable(s, p, () => pen, x => cmd('stroke', p.id, { s: x }));
    r.append(btn('eye', 'Groß an die Tafel', () => cmd('zoom', p.id)), btn('pen', 'Zeichnen', () => { draw = !draw; detail(); }, draw ? 'an' : 'leise'));
    if (draw) {
      FW.PEN.forEach((col, i) => { const b = el('button', 'stift' + (pen === i ? ' an' : '')); b.style.background = col; b.setAttribute('aria-label', ['Orange', 'Gelb', 'Blau', 'Grün'][i]); b.onclick = () => { pen = i; detail(); }; r.appendChild(b); });
      r.append(btn('undo', 'Zurücknehmen', () => cmd('undo', p.id)));
    } else {
      ['offen', 'A', 'B', 'C'].forEach((t, i) => r.append(btn('', t, () => cmd('group', p.id, { v: i }), p.group === i ? 'an' : 'leise')));
      r.append(btn('trash', 'Von der Wand nehmen', () => { d.close(); cmd('remove', p.id); }, 'orange'));
    }
    box.append(v, r, btn('close', 'Schließen', () => d.close()));
    d.innerHTML = ''; d.appendChild(box); if (!d.open) d.showModal();
  }
  setInterval(() => { if (net && net.open && mode === 'ready') net.send({ t: 'ping' }); }, 3000);
  document.addEventListener('DOMContentLoaded', () => {
    // Geheimen Code nicht in der Adresszeile stehen lassen
    if (key) history.replaceState(null, '', location.pathname + location.search);
    if (!me) { mode = 'no'; render(); return; }
    save(); render(); connect();
  });
})();
