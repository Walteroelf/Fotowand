'use strict';
/* Tafel (oder Lehrer-iPad): zeigt die Fotowand. Dieses Gerät entscheidet, was sichtbar ist.
   Fotos liegen nur im Arbeitsspeicher und sind nach Schließen oder Neuladen weg. */
(function () {
  const $ = id => document.getElementById(id), btn = FW.btn;
  const KEY = 'fw.wall', MAX = 3e6, MAX_ALL = 150, MAX_KID = 20, HOURS = 4;
  const S = Object.assign({ room: '', remote: false, token: '', task: '', multi: true, names: false, groups: false, pile: false, expect: 0, stopped: false, covered: false }, FW.store.get(KEY, {}));
  const photos = [];            // {id, pid, name, buf, url, w, h, state:'wait'|'wall', strokes, group, ts}
  const kids = new Map();       // conn -> {pid, name}
  let host = null, remote = null, pairing = null, pairKey = FW.rid(24);
  let view = null;              // {ids, draw} = Großansicht
  let drops = 0;                // zählt die hingeworfenen Fotos, das neueste liegt oben
  let perm = [];                // zufällige Reihenfolge der Plätze im Fotostapel
  let picking = null, pen = 0;  // picking = ausgewählte Fotos zum Vergleichen
  const save = () => FW.store.set(KEY, S);
  const byId = id => photos.find(p => p.id === id);
  const shown = () => photos.filter(p => p.state === 'wall');
  const waiting = () => photos.filter(p => p.state === 'wait');
  const link = (page, extra) => new URL(page + FW.netQuery, location.href).href.split('#')[0] + '#r=' + S.room + (extra || '');
  const remoteOn = () => !!(remote && remote.conn.open);

  /* ---------- Verbindung ---------- */
  function start() {
    if (!S.room) { S.room = FW.genCode(4); save(); }
    drawQr();
    host = FW.hostRoom(S.room, {
      onStatus(s) { if (s !== 'open') $('stand').textContent = s === 'connecting' ? 'verbinde …' : 'keine Verbindung'; },
      onOpen() { count(); },
      onTaken() { host.close(); S.room = ''; save(); start(); },
      onConn(conn) {
        conn.on('data', d => { if (d && typeof d.t === 'string') onData(conn, d); });
        conn.on('close', () => {
          kids.delete(conn); count();
          if (remote && remote.conn === conn) { remote = null; ui(); }
          if (pairing && pairing.conn === conn) { pairing = null; $('dlg').close(); }
        });
      }
    });
  }
  function onData(conn, d) {
    if (d.t === 'hello') {
      kids.set(conn, { pid: String(d.pid).slice(0, 20), name: String(d.name).slice(0, 40) }); count(); sendInfo(conn);
      photos.filter(p => p.pid === kids.get(conn).pid).forEach(p => tell(p));
    } else if (d.t === 'photo') receive(conn, d);
    else if (d.t === 'pair') {
      if (!S.remote || S.token || d.key !== pairKey || (pairing && pairing.conn.open)) { conn.send({ t: 'no' }); return; }
      pairing = { conn, num: FW.ri(10, 99) }; conn.send({ t: 'confirm', num: pairing.num }); askNumber();
    } else if (d.t === 'auth') {
      if (S.remote && S.token && d.token === S.token) accept(conn); else conn.send({ t: 'no' });
    } else if (remote && remote.conn === conn) {
      remote.seen = Date.now();
      if (d.t === 'need') { const p = byId(d.id); if (p) conn.send({ t: 'img', id: p.id, buf: p.buf }); }
      else if (d.t === 'ping') conn.send({ t: 'pong' });
      else if (d.t === 'cmd') command(d);
    }
  }
  function receive(conn, d) {
    const k = kids.get(conn); if (!k || !/^[a-z0-9]{6,20}$/.test(d.id)) return;
    const old = byId(d.id); if (old) { tell(old); return; }
    const w = d.w | 0, h = d.h | 0;
    const full = photos.length >= MAX_ALL || photos.filter(p => p.pid === k.pid).length >= MAX_KID;
    if (S.stopped || full || !d.buf || !(d.buf.byteLength > 0 && d.buf.byteLength <= MAX) || w < 1 || h < 1 || w > 4000 || h > 4000) {
      conn.send({ t: 'status', id: d.id, s: S.stopped ? 'stopped' : 'refused' }); return;
    }
    const buf = d.buf instanceof ArrayBuffer ? d.buf : new Uint8Array(d.buf).slice().buffer;
    const p = { id: d.id, pid: k.pid, name: k.name, buf, url: URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' })), w, h, state: 'wait', strokes: [], group: 0, ts: Date.now() };
    // Ein neues wartendes Foto ersetzt das alte wartende, wenn nur eines pro Kind erlaubt ist
    if (!S.multi) waiting().filter(x => x.pid === p.pid).forEach(x => remove(x, true));
    photos.push(p);
    if (S.remote) { tell(p); ui(); } else show(p);
  }
  function tell(p, s) {
    const msg = { t: 'status', id: p.id, s: s || (p.state === 'wall' ? 'shown' : 'wait') };
    kids.forEach((k, c) => { if (k.pid === p.pid) c.send(msg); });
  }
  const sendInfo = c => c.send({ t: 'info', task: S.task, stopped: S.stopped });
  const count = () => { $('stand').textContent = new Set([...kids.values()].map(k => k.pid)).size + ' dabei'; };

  /* ---------- Fotos ---------- */
  function show(p) {
    if (!S.multi) shown().filter(x => x.pid === p.pid && x !== p).forEach(x => remove(x, true));
    p.state = 'wall'; tell(p); ui();
  }
  function remove(p, quiet) {
    const i = photos.indexOf(p); if (i < 0) return;
    photos.splice(i, 1); URL.revokeObjectURL(p.url); tell(p, 'removed');
    if (view) { view.ids = view.ids.filter(id => id !== p.id); if (!view.ids.length) view = null; }
    if (!quiet) ui();
  }
  function clearAll() { photos.slice().forEach(p => remove(p, true)); perm = []; view = null; picking = null; $('druck').innerHTML = ''; ui(); }
  function random() {
    const l = shown(); if (!l.length) return;
    const other = l.filter(p => !view || p.id !== view.ids[0]);
    S.covered = false; view = { ids: [FW.pick(other.length ? other : l).id] }; ui();
  }
  function set(k, v) { if (k === 'pile' || k === 'expect') { perm = []; photos.forEach(p => { delete p.spot; }); } S[k] = v; save(); if (k === 'task' || k === 'stopped') kids.forEach((x, c) => sendInfo(c)); if (k === 'covered' && v) view = null; ui(); }

  /* ---------- Fernbedienung ---------- */
  function command(d) {
    const p = d.id ? byId(d.id) : null;
    if (d.c === 'approve' && p) show(p);
    else if (d.c === 'remove' && p) remove(p);
    else if (d.c === 'zoom' && p && p.state === 'wall') { S.covered = false; view = { ids: [p.id] }; ui(); }
    else if (d.c === 'close') { view = null; ui(); }
    else if (d.c === 'random') random();
    else if (d.c === 'stopped' || d.c === 'covered') set(d.c, !!d.v);
    else if (d.c === 'group' && p) { p.group = Math.min(3, Math.max(0, d.v | 0)); ui(); }
    else if (d.c === 'stroke' && p && d.s && Array.isArray(d.s.p) && d.s.p.length && p.strokes.length < 200) {
      p.strokes.push({ c: d.s.c | 0, p: d.s.p.slice(0, 401).map(a => [+a[0] || 0, +a[1] || 0]) }); ui();
    } else if (d.c === 'undo' && p) { p.strokes.pop(); ui(); }
  }
  function accept(conn) {
    if (remote && remote.conn !== conn) remote.conn.close();
    remote = { conn, seen: Date.now() }; conn.send({ t: 'paired', token: S.token }); ui();
  }
  function sync() {
    if (!remoteOn()) return;
    remote.conn.send({ t: 'state', stopped: S.stopped, covered: S.covered, big: view ? view.ids : [], names: S.names,
      photos: photos.map(p => ({ id: p.id, name: p.name, w: p.w, h: p.h, state: p.state, strokes: p.strokes, group: p.group })) });
  }
  setInterval(() => { if (remote && (!remote.conn.open || Date.now() - remote.seen > 12000)) { remote.conn.close(); remote = null; ui(); } }, 3000);
  function askNumber() {
    const set3 = new Set([pairing.num]); while (set3.size < 3) set3.add(FW.ri(10, 99));
    const row = el('div', 'reihe');
    [...set3].sort().forEach(n => row.appendChild(btn('', String(n), () => {
      const pr = pairing; pairing = null; $('dlg').close(); if (!pr) return;
      if (n === pr.num) { S.token = FW.rid(32); save(); pairKey = FW.rid(24); accept(pr.conn); }
      else { pr.conn.send({ t: 'no' }); pairKey = FW.rid(24); }
    }, 'leise riesigzahl')));
    dialog('Welche Zahl zeigt die Fernbedienung?', [row], () => { if (pairing) { pairing.conn.send({ t: 'no' }); pairing = null; pairKey = FW.rid(24); } });
  }
  function dropRemote() {
    if (remote) { remote.conn.send({ t: 'no' }); remote = null; }
    S.token = ''; pairKey = FW.rid(24); save(); ui();
  }
  function showRemoteQr() {
    if (!S.remote) set('remote', true);
    if (S.token) {
      dialog('Fernbedienung', [el('p', '', remoteOn() ? 'Verbunden.' : 'Gekoppelt, aber gerade nicht verbunden. Neue Fotos bleiben verborgen.'),
        btn('close', 'Gerät trennen und neu koppeln', () => { dropRemote(); showRemoteQr(); }, 'orange'),
        btn('', 'Ohne Fernbedienung weiter', () => { $('dlg').close(); switchOff(); })]);
      return;
    }
    const q = el('div', 'qr'), c = FW.makeQR(link('fern.html', '&k=' + pairKey)); if (c) q.appendChild(c);
    dialog('Nur für dein zweites Gerät', [q, el('p', '', 'Mit dem Lehrer-Gerät scannen. Danach hier die passende Zahl antippen.')]);
  }
  function switchOff() {
    const done = () => { $('dlg').close(); S.remote = false; dropRemote(); };
    if (!waiting().length) { done(); return; }
    dialog(waiting().length === 1 ? '1 Foto wartet noch' : waiting().length + ' Fotos warten noch', [
      btn('eye', 'Alle zeigen', () => { done(); waiting().forEach(show); }),
      btn('trash', 'Wartende verwerfen', () => { waiting().forEach(p => remove(p, true)); done(); }, 'orange')]);
  }

  /* ---------- Oberfläche ---------- */
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function dialog(title, nodes, onClose) {
    const d = $('dlg'); d.onclose = null; if (d.open) d.close();
    const box = el('div', 'inhalt'); box.append(el('h2', '', title), ...nodes, btn('close', 'Schließen', () => d.close()));
    d.innerHTML = ''; d.appendChild(box); d.showModal();
    // close-Ereignis kommt verzögert: nur reagieren, wenn nicht schon ein neues Fenster offen ist
    d.onclose = () => { if (!d.open) { d.innerHTML = ''; onClose && onClose(); } };
  }
  function drawQr() {
    const c = FW.makeQR(link('foto.html')); $('qr').innerHTML = ''; if (c) $('qr').appendChild(c); $('code').textContent = S.room;
  }
  function tile(p, i) {
    const k = el('div', 'kachel' + (S.covered ? ' zu' : '') + (picking && picking.includes(p.id) ? ' gewaehlt' : ''));
    k.tabIndex = 0; k.setAttribute('role', 'button');
    k.style.borderColor = FW.kidColor(p.name) || '';
    const b = el('div', 'bild'); if (S.covered) b.textContent = String(i + 1); else b.appendChild(FW.picture(p));
    k.appendChild(b); if (S.names && !S.covered) k.appendChild(el('span', '', p.name));
    k.onclick = () => {
      if (S.covered) return;
      if (picking) { const j = picking.indexOf(p.id); if (j >= 0) picking.splice(j, 1); else if (picking.length < 4) picking.push(p.id); }
      else view = { ids: [p.id] };
      ui();
    };
    k.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); k.click(); } };
    return k;
  }
  // Spalten und Zeilen so wählen, dass n Fotos (Querformat 4:3) möglichst groß in die Fläche passen
  function fit(n, W, H) {
    let best = { cols: 1, rows: n, s: 0 };
    for (let cols = 1; cols <= n; cols++) { const rows = Math.ceil(n / cols), s = Math.min(W / cols / 4, H / rows / 3); if (s > best.s) best = { cols, rows, s }; }
    return best;
  }
  function drawWall() {
    const w = $('wand'), l = shown(); w.innerHTML = ''; w.className = '';
    if (S.remote && waiting().length) w.appendChild(el('p', 'wartet', waiting().length === 1 ? '1 Foto wartet' : waiting().length + ' Fotos warten'));
    if (!l.length) return;
    const grid = list => { const g = el('div', 'raster'); list.forEach(p => g.appendChild(tile(p, l.indexOf(p)))); return g; };
    if (S.groups) {
      const cols = el('div', 'gruppen');
      ['Noch offen', 'Gruppe A', 'Gruppe B', 'Gruppe C'].forEach((n, i) => {
        const list = l.filter(p => p.group === i); if (!list.length) return;
        const c = el('section'); c.append(el('h2', '', n), grid(list)); cols.appendChild(c);
      });
      w.appendChild(cols); return;
    }
    const area = el('div', S.pile ? 'stapel' : 'raster fest'); w.appendChild(area);
    const W = area.clientWidth, H = area.clientHeight;
    if (S.pile) { pile(area, l, W, H); return; }
    // Raster: alle Fotos ohne Scrollen sichtbar. Die erwartete Zahl hält die Größe ruhig.
    const f = fit(Math.max(S.expect || 1, l.length), W - 8, H - 8);
    area.style.gridTemplateColumns = 'repeat(' + f.cols + ', minmax(0, 1fr))';
    area.style.gridTemplateRows = 'repeat(' + f.rows + ', minmax(0, 1fr))';
    l.forEach((p, i) => area.appendChild(tile(p, i)));
  }
  // Fotostapel: erst wird reihum der ganze Hintergrund bedeckt, danach landen die Fotos kreuz und quer darüber
  function pile(area, l, W, H) {
    const f = fit(S.expect || 20, W, H), cells = f.cols * f.rows;
    if (perm.length !== cells) { perm = [...Array(cells).keys()]; for (let i = cells - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; } }
    const cw = W / f.cols, ch = H / f.rows;
    l.forEach((p, i) => {
      if (!p.spot) {
        const used = new Set(photos.filter(x => x.spot).map(x => x.spot.k)); let k = 0; while (used.has(k)) k++;
        p.spot = { k, x: Math.random(), y: Math.random(), rot: Math.round(Math.random() * 28 - 14), neu: true };
        p.top = ++drops;
      }
      const s = p.spot, c = tile(p, i);
      const scale = Math.min(cw * 1.42 / p.w, ch * 1.42 / p.h), pw = p.w * scale, ph = p.h * scale;
      const cx = s.k < cells ? (perm[s.k] % f.cols + 0.35 + s.x * 0.3) * cw : s.x * W;
      const cy = s.k < cells ? (Math.floor(perm[s.k] / f.cols) + 0.35 + s.y * 0.3) * ch : s.y * H;
      const keep = (v, size, max) => Math.min(max - size / 2, Math.max(size / 2, v)) - size / 2;
      c.style.width = pw + 'px'; c.style.height = ph + 'px';
      c.style.left = keep(cx, pw, W) + 'px'; c.style.top = keep(cy, ph, H) + 'px';
      c.style.transform = 'rotate(' + s.rot + 'deg)'; c.style.zIndex = p.top;
      if (s.neu) { c.classList.add('neu'); s.neu = false; }
      area.appendChild(c);
    });
  }
  addEventListener('resize', () => drawWall());
  function drawBar() {
    const n = $('leiste'); n.innerHTML = '';
    if (picking) {
      const go = btn('compare', picking.length + ' vergleichen', () => { view = { ids: picking.slice() }; picking = null; ui(); }, 'gelb'); go.disabled = picking.length < 2;
      n.append(go, btn('close', 'Abbrechen', () => { picking = null; ui(); })); return finish(n);
    }
    n.append(btn(S.stopped ? 'play' : 'stopp', S.stopped ? 'Fotos annehmen' : 'Fotos stoppen', () => set('stopped', !S.stopped), S.stopped ? 'orange' : 'leise'),
      btn(S.covered ? 'eye' : 'eyeoff', S.covered ? 'Aufdecken' : 'Verdecken', () => set('covered', !S.covered), S.covered ? 'gelb' : 'leise'));
    const c = btn('compare', 'Vergleichen', () => { picking = []; set('covered', false); }); c.disabled = shown().length < 2;
    const z = btn('dice', 'Zufall', random); z.disabled = !shown().length;
    n.append(c, z, btn('menu', 'Menü', menu)); finish(n);
  }
  // Auf schmalen Bildschirmen nur Symbole, darum bekommt jeder Knopf auch einen Namen
  function finish(n) {
    n.querySelectorAll('button').forEach(b => { b.title = b.textContent; b.setAttribute('aria-label', b.textContent); });
    if (FW.canFull) n.appendChild(FW.fullBtn());
  }
  function drawBig() {
    const g = $('gross'); g.hidden = !view; g.innerHTML = ''; if (!view) return;
    const list = view.ids.map(byId).filter(Boolean), area = el('div', 'flaeche n' + list.length), bar = el('div', 'reihe');
    list.forEach(p => {
      const f = el('figure'), s = FW.picture(p); f.appendChild(s); f.style.borderColor = FW.kidColor(p.name) || ''; if (S.names) f.appendChild(el('figcaption', '', p.name));
      if (view.draw) FW.drawable(s, p, () => pen, st => { p.strokes.push(st); sync(); });
      area.appendChild(f);
    });
    bar.appendChild(btn('left', 'Zurück', () => { view = null; ui(); }, ''));
    bar.appendChild(btn('pen', 'Zeichnen', () => { view.draw = !view.draw; drawBig(); }, view.draw ? 'an' : 'leise'));
    if (view.draw) {
      FW.PEN.forEach((col, i) => { const b = el('button', 'stift' + (pen === i ? ' an' : '')); b.style.background = col; b.setAttribute('aria-label', ['Orange', 'Gelb', 'Blau', 'Grün'][i]); b.onclick = () => { pen = i; drawBig(); }; bar.appendChild(b); });
      bar.appendChild(btn('undo', 'Zurücknehmen', () => { list.forEach(p => p.strokes.pop()); ui(); }));
    } else if (list.length === 1) {
      const p = list[0];
      if (S.groups) ['offen', 'A', 'B', 'C'].forEach((t, i) => bar.appendChild(btn('', t, () => { p.group = i; ui(); }, p.group === i ? 'an' : 'leise')));
      bar.appendChild(btn('trash', 'Von der Wand nehmen', () => remove(p), 'orange'));
    }
    if (FW.canFull) bar.appendChild(FW.fullBtn());
    g.append(area, bar);
  }
  function ui() {
    $('auftrag').textContent = S.task;
    $('fernAn').checked = S.remote;
    const f = $('fernKnopf'), on = remoteOn();
    f.className = 'knopf leise' + (S.remote ? (on ? ' an' : ' warte') : '');
    const label = 'Fernbedienung' + (!S.remote ? '' : on ? ': verbunden' : S.token ? ': getrennt' : ': koppeln');
    f.innerHTML = FW.icon(S.remote && on ? 'check' : 'remote'); f.title = label; f.setAttribute('aria-label', label);
    $('auftrag').parentNode.classList.toggle('leerband', !S.task);
    drawWall(); drawBar(); drawBig(); sync();
  }
  function menu() {
    const field = el('label', 'inhalt', 'Auftrag (steht über der Wand und auf den iPads)'), inp = el('input'); inp.type = 'text'; inp.maxLength = 120; inp.value = S.task; inp.placeholder = 'Fotografiere deine Rechnung'; inp.onchange = () => set('task', inp.value.trim()); field.appendChild(inp);
    const sw = (key, text, inv) => { const l = el('label', 'schalter'), c = el('input'); c.type = 'checkbox'; c.checked = inv ? !S[key] : S[key]; c.onchange = () => set(key, inv ? !c.checked : c.checked); l.append(c, document.createTextNode(text)); return l; };
    const choose = (text, key, options) => { const l = el('label', 'inhalt', text), s = el('select'); options.forEach(o => { const x = el('option', '', o[1]); x.value = o[0]; s.appendChild(x); }); s.value = Number(S[key]); s.onchange = () => set(key, key === 'pile' ? s.value === '1' : Number(s.value)); l.appendChild(s); return l; };
    const look = choose('Darstellung', 'pile', [[0, 'Geordnet'], [1, 'Bunter Fotostapel']]);
    const size = choose('Wie viele Fotos erwartest du? (bestimmt die Größe)', 'expect', [[0, 'Automatisch'], [10, 'etwa 10'], [20, 'etwa 20'], [30, 'etwa 30'], [50, 'etwa 50']]);
    const pdf = btn('download', 'Als PDF drucken oder sichern', () => { $('dlg').close(); print_(); }); pdf.disabled = !shown().length;
    dialog('Menü', [field, look, size, sw('multi', 'Nur ein Foto pro Kind (ein neues ersetzt das alte)', true), sw('names', 'Namen zeigen (Fantasienamen)'), sw('groups', 'In Gruppen sortieren (A, B, C)'), pdf,
      btn('trash', 'Beenden und alles löschen', confirmEnd, 'orange')]);
  }
  function print_() {
    const d = $('druck'); d.innerHTML = ''; d.appendChild(el('h1', '', S.task || FW.NAME));
    shown().sort((a, b) => a.group - b.group).forEach(p => { const f = el('figure'); f.appendChild(FW.picture(p)); const t = [S.groups && p.group ? 'Gruppe ' + 'ABC'[p.group - 1] : '', S.names ? p.name : ''].filter(Boolean).join(' · '); if (t) f.appendChild(el('figcaption', '', t)); d.appendChild(f); });
    setTimeout(() => print(), 300);
  }
  function confirmEnd() {
    dialog('Wirklich alles löschen?', [el('p', '', 'Alle Fotos werden gelöscht. Es gibt einen neuen Code.'),
      btn('trash', 'Ja, alles löschen', () => {
        kids.forEach((k, c) => c.send({ t: 'end' })); if (remote) remote.conn.send({ t: 'no' });
        clearAll(); FW.store.set(KEY, { remote: S.remote, multi: S.multi }); setTimeout(() => { removeEventListener('beforeunload', guard); location.reload(); }, 600);
      }, 'orange')]);
  }
  const guard = e => { if (photos.length) { e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', guard);
  setInterval(() => photos.filter(p => Date.now() - p.ts > HOURS * 36e5).forEach(p => remove(p)), 60000);

  document.addEventListener('DOMContentLoaded', () => {
    $('qrKnopf').onclick = () => $('qrBox').classList.toggle('gross');
    $('fernAn').onchange = e => { if (e.target.checked) set('remote', true); else { e.target.checked = true; switchOff(); ui(); } };
    $('fernKnopf').onclick = showRemoteQr;
    start(); ui();
  });
})();
