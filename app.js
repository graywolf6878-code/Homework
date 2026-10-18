(function () {
  'use strict';

  // ------------------------------------------------------------------ constants
  const KEY = 'hwf_state_v2';
  const COLORS = ['#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#06b6d4', '#d4a373', '#94a3b8'];
  const CAL = [[10080, '1 week'], [1440, '1 day'], [180, '3 hours'], [60, '1 hour'], [15, '15 min']];
  const MIN = 60000, DAY = 86400000;
  const CNT_LABEL = { over: 'overdue', red: 'under 24 h', yellow: 'under 2 d', blue: 'under 1 wk', green: 'later' };

  const ICON = {
    back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    dots: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>'
  };

  // ------------------------------------------------------------------ helpers
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = n => String(n).padStart(2, '0');
  const ymd = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const hm = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  function parseLocal(dateStr, timeStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
    const n = /^(\d{2}):(\d{2})$/.exec(timeStr || '23:59');
    if (!m || !n) return NaN;
    return new Date(+m[1], +m[2] - 1, +m[3], +n[1], +n[2], 0, 0).getTime();
  }
  function tomorrowStr() { const t = new Date(); t.setDate(t.getDate() + 1); return ymd(t.getTime()); }
  function fmtDue(ms) {
    const o = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    if (new Date(ms).getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return new Date(ms).toLocaleString([], o);
  }

  // ------------------------------------------------------------------ urgency (automatic)
  function urg(due, now) {
    const d = due - (now || Date.now());
    if (d < 0) return 'over';
    if (d <= DAY) return 'red';
    if (d <= 2 * DAY) return 'yellow';
    if (d <= 7 * DAY) return 'blue';
    return 'green';
  }
  function span(ms) {
    const m = Math.max(1, Math.round(ms / MIN));
    if (m < 60) return m + ' min';
    if (m < 2880) return Math.floor(m / 60) + ' h';
    return Math.floor(m / 1440) + ' d';
  }
  function pillText(due, now) {
    const d = due - now;
    return d < 0 ? 'Overdue by ' + span(-d) : 'Due in ' + span(d);
  }

  // ------------------------------------------------------------------ state
  function defaultState() { return { v: 2, folders: [], items: [], settings: { opacity: 100, cal: [1440, 60] } }; }
  let S = defaultState();
  let storageOk = true;

  function sanitize(d) {
    if (!d || !Array.isArray(d.folders) || !Array.isArray(d.items)) return null;
    const folders = d.folders
      .filter(f => f && typeof f.id === 'string' && typeof f.name === 'string')
      .map(f => ({ id: f.id, name: f.name.slice(0, 60), color: COLORS.indexOf(f.color) >= 0 ? f.color : COLORS[0] }));
    const ids = new Set(folders.map(f => f.id));
    const items = d.items
      .filter(i => i && typeof i.id === 'string' && ids.has(i.folderId) && typeof i.title === 'string' && Number.isFinite(i.due))
      .map(i => ({
        id: i.id, folderId: i.folderId, title: i.title.slice(0, 200),
        notes: typeof i.notes === 'string' ? i.notes.slice(0, 2000) : '',
        due: i.due, done: !!i.done, doneAt: Number.isFinite(i.doneAt) ? i.doneAt : 0
      }));
    const s = d.settings || {};
    const cal = Array.isArray(s.cal) ? s.cal.filter(m => CAL.some(c => c[0] === m)) : [1440, 60];
    const opacity = Number.isFinite(s.opacity) ? Math.min(100, Math.max(30, Math.round(s.opacity))) : 100;
    return { v: 2, folders, items, settings: { opacity, cal } };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const d = sanitize(JSON.parse(raw)); if (d) S = d; }
    } catch (e) {}
    try { localStorage.setItem(KEY + '_t', '1'); localStorage.removeItem(KEY + '_t'); } catch (e) { storageOk = false; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { storageOk = false; showWarn(); } }
  function showWarn() {
    const w = $('#warn');
    if (!storageOk) { w.textContent = 'Your browser is blocking storage, so changes will not be saved. Use the Home Screen app.'; w.hidden = false; }
  }
  function applySettings() { document.documentElement.style.setProperty('--pa', String(S.settings.opacity / 100)); }

  const getFolder = id => S.folders.find(f => f.id === id);
  const getItem = id => S.items.find(i => i.id === id);
  const byDue = (a, b) => a.due - b.due || a.title.localeCompare(b.title);
  const openItems = fid => S.items.filter(i => !i.done && (!fid || i.folderId === fid)).sort(byDue);
  const doneItems = fid => S.items.filter(i => i.done && i.folderId === fid).sort((a, b) => b.doneAt - a.doneAt);

  // ------------------------------------------------------------------ undo + toast
  let undoSnap = null, toastTimer = null;
  function showToast(msg, withUndo) {
    $('#toastMsg').textContent = msg;
    $('#toastUndo').hidden = !withUndo;
    $('#toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, withUndo ? 7000 : 3500);
  }
  function hideToast() { $('#toast').hidden = true; undoSnap = null; }
  function mutate(label, fn) {
    const snap = JSON.stringify(S);
    fn();
    save();
    undoSnap = snap;
    showToast(label, true);
    refreshViews();
  }
  function doUndo() {
    if (!undoSnap) return;
    let restored = null;
    try { restored = sanitize(JSON.parse(undoSnap)); } catch (e) {}
    if (!restored) { hideToast(); return; }
    restored.settings = S.settings;
    S = restored;
    save();
    hideToast();
    renderRoute(true);
  }

  // ------------------------------------------------------------------ sheet
  function openSheet(html, mount) {
    hideToast();
    $('#sheetBody').innerHTML = html;
    $('#sheet').hidden = false;
    $('.sheet').scrollTop = 0;
    document.body.classList.add('noscroll');
    if (mount) mount();
  }
  function closeSheet() {
    $('#sheet').hidden = true;
    $('#sheetBody').innerHTML = '';
    document.body.classList.remove('noscroll');
  }
  const sheetOpen = () => !$('#sheet').hidden;

  // ------------------------------------------------------------------ routing
  let route = { name: 'home' };
  function parseHash() {
    const p = location.hash.replace(/^#\/?/, '').split('/');
    if (p[0] === 'all') return { name: 'all' };
    if (p[0] === 'folder' && getFolder(p[1])) return { name: 'folder', id: p[1] };
    return { name: 'home' };
  }
  function go(hash) { if (location.hash === hash) renderRoute(); else location.hash = hash; }

  const app = () => $('#app');

  function renderRoute(keepScroll) {
    route = parseHash();
    if (sheetOpen()) closeSheet();
    const y = window.scrollY;
    if (route.name === 'home') renderHome();
    else if (route.name === 'all') renderAll();
    else renderFolder();
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
    applyBg();
  }
  function applyBg() {
    if (window.WP && typeof WP.apply === 'function') {
      try { WP.apply(route.name === 'folder' ? route.id : null); } catch (e) {}
    }
  }
  function refreshViews() {
    if (route.name === 'folder') {
      if (!getFolder(route.id)) { location.hash = '#/'; return; }
      renderFolderList();
    } else if (route.name === 'all') renderAllList();
    else renderHomeBody();
  }

  // ------------------------------------------------------------------ cards
  function card(it, showFolder, showDonePill) {
    const f = getFolder(it.folderId);
    const now = Date.now();
    const u = it.done ? 'done' : urg(it.due, now);
    const pill = it.done
      ? (showDonePill ? '<span class="pill">Done</span>' : '')
      : '<span class="pill">' + esc(pillText(it.due, now)) + '</span>';
    return '<div class="card u-' + u + (it.done ? ' isdone' : '') + '" data-act="edit" data-id="' + it.id + '">' +
      '<button class="chk' + (it.done ? ' on' : '') + '" data-act="toggle" aria-label="' + (it.done ? 'Mark not done' : 'Mark done') + '">' + (it.done ? ICON.check : '') + '</button>' +
      '<div class="info"><div class="t">' + esc(it.title) + '</div>' +
      '<div class="m">' + pill + '<span>' + esc(fmtDue(it.due)) + '</span>' +
      (showFolder && f ? '<span class="chip" style="--c:' + f.color + '">' + esc(f.name) + '</span>' : '') + '</div>' +
      (it.notes ? '<div class="n">' + esc(it.notes) + '</div>' : '') + '</div>' +
      (it.done ? '<button class="xbtn" data-act="del" aria-label="Delete permanently">✕</button>' : '') +
      '</div>';
  }

  // ------------------------------------------------------------------ home
  function renderHome() {
    app().innerHTML =
      '<header class="top"><h1><span class="name">Homework</span></h1><button class="pillbtn" data-act="settings">Settings</button></header>' +
      '<div class="search"><input id="q" type="search" placeholder="Search all assignments" autocomplete="off" enterkeyhint="search"></div>' +
      '<div id="homeBody"></div>';
    $('#q').addEventListener('input', renderHomeBody);
    renderHomeBody();
  }

  function renderHomeBody() {
    const body = $('#homeBody');
    if (!body) return;
    const qEl = $('#q');
    const q = ((qEl && qEl.value) || '').trim().toLowerCase();
    const now = Date.now();

    if (q) {
      const hits = S.items.filter(i => {
        const f = getFolder(i.folderId);
        return i.title.toLowerCase().indexOf(q) >= 0 || i.notes.toLowerCase().indexOf(q) >= 0 || (f && f.name.toLowerCase().indexOf(q) >= 0);
      }).sort((a, b) => (a.done - b.done) || (a.done ? b.doneAt - a.doneAt : a.due - b.due));
      body.innerHTML = hits.length
        ? hits.map(i => card(i, true, true)).join('')
        : '<div class="empty">No assignments match “' + esc(qEl.value.trim()) + '”.</div>';
      return;
    }

    const open = openItems();
    const counts = { over: 0, red: 0, yellow: 0, blue: 0, green: 0 };
    open.forEach(i => { counts[urg(i.due, now)]++; });
    const chips = ['over', 'red', 'yellow', 'blue', 'green'].filter(k => counts[k]).map(k =>
      '<span class="cnt u-' + k + '">' + counts[k] + ' ' + CNT_LABEL[k] + '</span>').join('');

    let html = '<div class="grid">' +
      '<button class="tile all" data-act="openAll"><div class="nm">All assignments</div>' +
      '<div class="sb">' + (open.length ? open.length + ' open' : 'Nothing open') + '</div>' +
      (chips ? '<div class="cnts">' + chips + '</div>' : '') + '</button>';

    S.folders.forEach(f => {
      const list = openItems(f.id);
      const over = list.filter(i => i.due < now).length;
      const top = list[0] ? urg(list[0].due, now) : null;
      let sub = list.length ? list.length + ' open' : 'Nothing open';
      if (over) sub += ' · ' + over + ' overdue';
      html += '<button class="tile' + (top ? ' u-' + top : '') + '" style="--fc:' + f.color + '" data-act="openFolder" data-fid="' + f.id + '">' +
        '<div class="nm">' + esc(f.name) + '</div><div class="sb">' + esc(sub) + '</div>' +
        (top ? '<span class="ud"></span>' : '') + '</button>';
    });
    html += '<button class="tile add" data-act="newFolder">+ New folder</button></div>';
    if (!S.folders.length) html += '<div class="empty">Create a folder for each class. Assignments live inside folders.</div>';
    body.innerHTML = html;
  }

  // ------------------------------------------------------------------ all view
  function renderAll() {
    app().innerHTML =
      '<header class="top"><button class="iconbtn" data-act="back" aria-label="Back">' + ICON.back + '</button><h1><span class="name">All assignments</span></h1></header>' +
      '<div id="listBody"></div>';
    renderAllList();
  }
  function renderAllList() {
    const body = $('#listBody');
    if (!body) return;
    const list = openItems();
    body.innerHTML = list.length ? list.map(i => card(i, true)).join('') : '<div class="empty">Nothing open. Nice.</div>';
  }

  // ------------------------------------------------------------------ folder view
  let doneOpen = false;
  function renderFolder() {
    const f = getFolder(route.id);
    const empty = !S.items.some(i => i.folderId === f.id);
    app().innerHTML =
      '<header class="top"><button class="iconbtn" data-act="back" aria-label="Back">' + ICON.back + '</button>' +
      '<h1><span class="dot" style="--c:' + f.color + '"></span><span class="name" id="fTitle">' + esc(f.name) + '</span></h1>' +
      '<button class="iconbtn" data-act="folderMenu" aria-label="Folder settings">' + ICON.dots + '</button></header>' +
      '<details class="addbox" id="addbox"' + (empty ? ' open' : '') + '><summary>+ Add assignment</summary>' +
      '<form id="addForm" class="formgrid">' +
      '<label>Assignment<input id="aTitle" type="text" required maxlength="200" autocomplete="off" placeholder="e.g. Chapter 4 problem set"></label>' +
      '<div class="two"><label>Due date<input id="aDate" type="date" required></label><label>Time<input id="aTime" type="time" required></label></div>' +
      '<label>Notes (optional)<textarea id="aNotes" rows="2" maxlength="2000"></textarea></label>' +
      '<button class="btn" type="submit">Add</button></form></details>' +
      '<div id="listBody"></div>';
    resetAddForm();
    $('#addForm').addEventListener('submit', onAdd);
    $('#listBody').addEventListener('toggle', e => {
      if (e.target && e.target.id === 'doneBox') doneOpen = e.target.open;
    }, true);
    renderFolderList();
  }
  function resetAddForm() {
    $('#aTitle').value = ''; $('#aNotes').value = '';
    $('#aDate').value = tomorrowStr(); $('#aTime').value = '23:59';
  }
  function onAdd(e) {
    e.preventDefault();
    const title = $('#aTitle').value.trim();
    const due = parseLocal($('#aDate').value, $('#aTime').value);
    if (!title || !Number.isFinite(due)) return;
    const notes = $('#aNotes').value.trim();
    const fid = route.id;
    mutate('Assignment added', () => {
      S.items.push({ id: uid(), folderId: fid, title, notes, due, done: false, doneAt: 0 });
    });
    resetAddForm();
    $('#addbox').open = false;
  }
  function renderFolderList() {
    const body = $('#listBody');
    const f = getFolder(route.id);
    if (!body || !f) return;
    const title = $('#fTitle'); if (title) title.textContent = f.name;
    const open = openItems(f.id), done = doneItems(f.id);
    let html = open.length ? open.map(i => card(i, false)).join('') : '<div class="empty">No open assignments.</div>';
    if (done.length) {
      html += '<details class="donebox" id="doneBox"' + (doneOpen ? ' open' : '') + '><summary>Done (' + done.length + ')</summary>' +
        done.map(i => card(i, false)).join('') + '</details>';
    }
    body.innerHTML = html;
  }

  // ------------------------------------------------------------------ assignment sheet
  function openEdit(id) {
    const it = getItem(id); if (!it) return;
    const f = getFolder(it.folderId);
    openSheet(
      '<h2>Edit assignment</h2><div class="sub"><span class="chip" style="--c:' + (f ? f.color : '#475569') + '">' + esc(f ? f.name : '') + '</span></div>' +
      '<form id="eForm" class="formgrid">' +
      '<label>Assignment<input id="eTitle" type="text" required maxlength="200" autocomplete="off" value="' + esc(it.title) + '"></label>' +
      '<div class="two"><label>Due date<input id="eDate" type="date" required value="' + ymd(it.due) + '"></label>' +
      '<label>Time<input id="eTime" type="time" required value="' + hm(it.due) + '"></label></div>' +
      '<label>Notes<textarea id="eNotes" rows="3" maxlength="2000">' + esc(it.notes) + '</textarea></label>' +
      '<div class="btns"><button class="btn" type="submit">Save</button><button class="btn sec" type="button" id="eCal">Add to Calendar</button></div>' +
      '<div class="btns"><button class="btn danger" type="button" id="eDel">Delete</button><button class="btn ghost" type="button" data-close>Cancel</button></div>' +
      '</form>',
      () => {
        const read = () => {
          const title = $('#eTitle').value.trim();
          const due = parseLocal($('#eDate').value, $('#eTime').value);
          if (!title || !Number.isFinite(due)) return null;
          return { title, due, notes: $('#eNotes').value.trim() };
        };
        $('#eForm').addEventListener('submit', e => {
          e.preventDefault();
          const v = read(); if (!v) return;
          closeSheet();
          mutate('Changes saved', () => { it.title = v.title; it.due = v.due; it.notes = v.notes; });
        });
        $('#eCal').addEventListener('click', () => {
          const v = read();
          if (!v) { $('#eForm').reportValidity(); return; }
          it.title = v.title; it.due = v.due; it.notes = v.notes;
          save(); refreshViews();
          exportIcs(it);
        });
        $('#eDel').addEventListener('click', () => {
          closeSheet();
          mutate('Assignment deleted', () => { S.items = S.items.filter(x => x.id !== id); });
        });
      }
    );
  }

  // ------------------------------------------------------------------ calendar export
  function icsFold(line) {
    const out = [];
    while (line.length > 73) { out.push(line.slice(0, 73)); line = ' ' + line.slice(73); }
    out.push(line);
    return out.join('\r\n');
  }
  function icsText(it) {
    const f = getFolder(it.folderId);
    const stamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const e2 = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
    const L = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Homework//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + it.id + '@homework-app',
      'SEQUENCE:' + Math.floor(Date.now() / 1000),
      'DTSTAMP:' + stamp(Date.now()),
      'DTSTART:' + stamp(it.due),
      'DTEND:' + stamp(it.due + 15 * MIN),
      'SUMMARY:' + e2('Due: ' + it.title + (f ? ' (' + f.name + ')' : ''))
    ];
    if (it.notes) L.push('DESCRIPTION:' + e2(it.notes));
    S.settings.cal.forEach(m => L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + e2(it.title), 'TRIGGER:-PT' + m + 'M', 'END:VALARM'));
    L.push('END:VEVENT', 'END:VCALENDAR');
    return L.map(icsFold).join('\r\n') + '\r\n';
  }
  function exportIcs(it) {
    const text = icsText(it);
    try {
      const file = new File([text], 'assignment.ics', { type: 'text/calendar' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file] }).catch(() => {});
        return;
      }
    } catch (e) {}
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
    a.download = 'assignment.ics';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ------------------------------------------------------------------ folder sheets
  function swatches(color) {
    return '<div class="swatches">' + COLORS.map(c =>
      '<button type="button" class="sw' + (c === color ? ' on' : '') + '" data-color="' + c + '" style="--c:' + c + '" aria-label="Color"></button>').join('') + '</div>';
  }
  function bindSwatches(cb) {
    document.querySelectorAll('#sheetBody .sw').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('#sheetBody .sw').forEach(x => x.classList.toggle('on', x === b));
      cb(b.dataset.color);
    }));
  }

  function openNewFolder() {
    let color = COLORS[S.folders.length % COLORS.length];
    openSheet(
      '<h2>New folder</h2><form id="nfForm" class="formgrid">' +
      '<label>Class name<input id="nfName" type="text" required maxlength="60" autocomplete="off" placeholder="e.g. MA 165"></label>' +
      '<div class="lbl">Color</div>' + swatches(color) +
      '<button class="btn" type="submit">Create folder</button><button class="btn ghost" type="button" data-close>Cancel</button></form>',
      () => {
        bindSwatches(c => { color = c; });
        $('#nfForm').addEventListener('submit', e => {
          e.preventDefault();
          const name = $('#nfName').value.trim(); if (!name) return;
          closeSheet();
          mutate('Folder created', () => { S.folders.push({ id: uid(), name, color }); });
        });
      }
    );
  }

  function openFolderMenu(fid) {
    const f = getFolder(fid); if (!f) return;
    const idx = S.folders.indexOf(f);
    let color = f.color;
    const hasWp = !!(window.WP && typeof WP.openEditor === 'function');
    openSheet(
      '<h2>Folder settings</h2><form id="fmForm" class="formgrid">' +
      '<label>Class name<input id="fmName" type="text" required maxlength="60" autocomplete="off" value="' + esc(f.name) + '"></label>' +
      '<div class="lbl">Color</div>' + swatches(color) +
      '<button class="btn" type="submit">Save</button></form>' +
      '<h3>Order on home screen</h3>' +
      '<div class="btns"><button class="btn sec" type="button" id="fmUp"' + (idx === 0 ? ' disabled' : '') + '>Move earlier</button>' +
      '<button class="btn sec" type="button" id="fmDown"' + (idx === S.folders.length - 1 ? ' disabled' : '') + '>Move later</button></div>' +
      (hasWp ? '<h3>Wallpaper</h3><button class="btn sec wide" type="button" id="fmWp" style="margin-top:0">Choose or change wallpaper…</button>' : '') +
      '<h3>Danger zone</h3><button class="btn danger wide" type="button" id="fmDel" style="margin-top:0">Delete folder</button>' +
      '<button class="btn ghost wide" type="button" data-close>Close</button>',
      () => {
        bindSwatches(c => { color = c; });
        $('#fmForm').addEventListener('submit', e => {
          e.preventDefault();
          const name = $('#fmName').value.trim(); if (!name) return;
          f.name = name; f.color = color; save();
          closeSheet(); renderRoute(true);
        });
        const move = d => {
          const j = idx + d; if (j < 0 || j >= S.folders.length) return;
          S.folders.splice(idx, 1); S.folders.splice(j, 0, f); save();
          openFolderMenu(fid);
        };
        $('#fmUp').addEventListener('click', () => move(-1));
        $('#fmDown').addEventListener('click', () => move(1));
        if (hasWp) $('#fmWp').addEventListener('click', () => { closeSheet(); WP.openEditor(fid); });
        $('#fmDel').addEventListener('click', () => {
          const n = S.items.filter(i => i.folderId === fid).length;
          if (!confirm('Delete "' + f.name + '"' + (n ? ' and its ' + n + ' assignment' + (n === 1 ? '' : 's') : '') + '?')) return;
          closeSheet();
          mutate('Folder deleted', () => {
            S.folders = S.folders.filter(x => x.id !== fid);
            S.items = S.items.filter(i => i.folderId !== fid);
          });
        });
      }
    );
  }

  // ------------------------------------------------------------------ settings sheet
  function openSettings() {
    openSheet(
      '<h2>Settings</h2>' +
      '<label><span>Card and folder opacity: <b id="opVal">' + S.settings.opacity + '%</b></span>' +
      '<input id="opRange" type="range" min="30" max="100" step="5" value="' + S.settings.opacity + '"></label>' +
      '<div class="note">100% is fully solid. Lower values make cards and folders see-through, so the folder wallpaper shows behind them.</div>' +
      '<h3>Calendar alerts</h3><div class="note" style="margin-bottom:8px">Used when you tap “Add to Calendar” on an assignment. Alerts fire before the due time.</div>' +
      '<div class="chkrow">' + CAL.map(c => '<label><input type="checkbox" data-cal="' + c[0] + '"' + (S.settings.cal.indexOf(c[0]) >= 0 ? ' checked' : '') + '>' + c[1] + ' before</label>').join('') + '</div>' +
      '<h3>Backup</h3><div class="note">Everything is stored on this phone only. Deleting the app erases it, so back up now and then. Wallpapers are not included in backups.</div>' +
      '<textarea id="bk" rows="4" placeholder="Backup text appears here. To restore, paste a backup here." style="margin-top:10px"></textarea>' +
      '<div class="btns" style="margin-top:10px"><button class="btn sec" type="button" id="bkCopy">Copy backup</button><button class="btn sec" type="button" id="bkRestore">Restore from box</button></div>' +
      '<div class="msg" id="bkMsg"></div>' +
      '<button class="btn ghost wide" type="button" data-close>Close</button>',
      () => {
        const msg = (t, err) => { const m = $('#bkMsg'); m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); };
        $('#opRange').addEventListener('input', e => {
          S.settings.opacity = +e.target.value; $('#opVal').textContent = S.settings.opacity + '%'; applySettings();
        });
        $('#opRange').addEventListener('change', save);
        document.querySelectorAll('#sheetBody [data-cal]').forEach(c => c.addEventListener('change', () => {
          S.settings.cal = [...document.querySelectorAll('#sheetBody [data-cal]')].filter(x => x.checked).map(x => +x.dataset.cal);
          save();
        }));
        $('#bkCopy').addEventListener('click', () => {
          const t = JSON.stringify(S), ta = $('#bk');
          ta.value = t;
          const fallback = () => { ta.focus(); ta.setSelectionRange(0, t.length); msg('Select and copy the text in the box.', true); };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(t).then(() => msg('Copied. Paste it into Notes or a message to yourself.')).catch(fallback);
          } else fallback();
        });
        $('#bkRestore').addEventListener('click', () => {
          const t = $('#bk').value.trim();
          if (!t) { msg('Paste a backup into the box first.', true); return; }
          let d = null;
          try { d = sanitize(JSON.parse(t)); } catch (e) {}
          if (!d) { msg('That does not look like a valid backup.', true); return; }
          if (!confirm('Replace everything in the app with this backup?')) return;
          S = d; save(); applySettings(); closeSheet(); hideToast(); renderRoute();
        });
      }
    );
  }

  // ------------------------------------------------------------------ events
  document.addEventListener('click', e => {
    if (sheetOpen() && e.target.closest('[data-close]')) { closeSheet(); return; }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const cardEl = el.closest('.card');
    const id = cardEl && cardEl.dataset.id;
    switch (act) {
      case 'back': location.hash = '#/'; break;
      case 'settings': openSettings(); break;
      case 'openAll': go('#/all'); break;
      case 'openFolder': go('#/folder/' + el.dataset.fid); break;
      case 'newFolder': openNewFolder(); break;
      case 'folderMenu': openFolderMenu(route.id); break;
      case 'edit': openEdit(id); break;
      case 'toggle': {
        const it = getItem(id); if (!it) break;
        mutate(it.done ? 'Moved back to open' : 'Marked done', () => { it.done = !it.done; it.doneAt = it.done ? Date.now() : 0; });
        break;
      }
      case 'del':
        mutate('Assignment deleted', () => { S.items = S.items.filter(x => x.id !== id); });
        break;
    }
  });
  $('#toastUndo').addEventListener('click', doUndo);
  window.addEventListener('hashchange', () => renderRoute());
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen()) closeSheet(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshViews(); });
  setInterval(() => { if (!document.hidden && !sheetOpen()) refreshViews(); }, 30000);

  // ------------------------------------------------------------------ hooks for wallpaper.js
  window.HW = {
    getFolder, esc, openSheet, closeSheet,
    toast: msg => showToast(msg, false),
    folderIds: () => S.folders.map(f => f.id)
  };

  // ------------------------------------------------------------------ start
  function init() {
    load();
    showWarn();
    applySettings();
    renderRoute();
    if (window.WP && typeof WP.cleanup === 'function') { try { WP.cleanup(S.folders.map(f => f.id)); } catch (e) {} }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
