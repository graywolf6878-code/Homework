// Wallpapers: pick a photo, crop it (zoom in or out), dim / blur it for readability.
// Used for each folder and for the home screen (key "home"). Everything is stored on this phone only
// (IndexedDB). Requires app.js (window.HW).
(function () {
  'use strict';
  if (!window.HW) return;

  const $ = (s, r) => (r || document).querySelector(s);
  const DB_NAME = 'hw_wallpapers', STORE = 'wp';
  const HOME = 'home';

  // ------------------------------------------------------------------ styles
  const css = document.createElement('style');
  css.textContent = `
  .wpPrev{position:relative;width:132px;aspect-ratio:9/19;margin:0 auto 16px;border-radius:18px;overflow:hidden;background:#0b1220;border:1px solid #334155}
  .wpPrevBg{position:absolute;inset:-8px;background-size:cover;background-position:center}
  .wpPrevDim{position:absolute;inset:0;background:#000;opacity:0}
  .wpPrevIn{position:absolute;inset:0;padding:12px 8px}
  .wpPrevT{font-weight:700;font-size:.8rem;text-shadow:0 1px 6px rgba(0,0,0,.7);margin-bottom:8px}
  .wpPrevCard{height:26px;border-radius:8px;margin-bottom:6px;background:rgba(var(--panel-rgb),var(--pa));border-left:4px solid var(--c)}
  .wpEmpty{position:absolute;inset:0;display:grid;place-items:center;color:#9aa8bc;font-size:.75rem;text-align:center;padding:8px}
  #wpCropOv{position:fixed;inset:0;z-index:90;background:#05070d;display:flex;flex-direction:column;touch-action:none;color:#f1f5f9}
  .wpc-top{display:flex;align-items:center;justify-content:space-between;padding:calc(10px + var(--sat)) 12px 10px}
  .wpc-title{font-weight:700}
  .wpc-btn{height:42px;padding:0 16px;border-radius:12px;border:0;background:#273449;color:#fff;font-weight:600}
  .wpc-btn.pri{background:#6366f1}
  .wpc-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:8px 12px}
  .wpc-frame{position:relative;overflow:hidden;border-radius:18px;background:#000;box-shadow:0 0 0 2px rgba(255,255,255,.35);touch-action:none;user-select:none;-webkit-user-select:none}
  .wpc-frame canvas{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
  .wpc-frame img{position:absolute;left:0;top:0;max-width:none;pointer-events:none;-webkit-user-drag:none;user-select:none}
  .wpc-bottom{padding:10px 24px calc(18px + var(--sab));text-align:center}
  .wpc-hint{font-size:.85rem;color:#9aa8bc;margin-bottom:10px}
  `;
  document.head.appendChild(css);

  // ------------------------------------------------------------------ IndexedDB
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('IndexedDB unavailable')); return; }
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('blocked'));
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(d => new Promise((res, rej) => {
      const t = d.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => res(r && r.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    }));
  }
  const dbGet = id => tx('readonly', s => s.get(id));
  const dbPut = rec => tx('readwrite', s => s.put(rec));
  const dbDel = id => tx('readwrite', s => s.delete(id));
  const dbKeys = () => tx('readonly', s => s.getAllKeys());

  // ------------------------------------------------------------------ look (dim / blur / readability)
  const urls = new Map();   // key -> { url, ts }
  let token = 0, shownFid = null;

  const autoDim = bright => Math.round(30 + (bright || 0) * 45);   // darker photos need less dimming
  const dimOf = rec => (rec.auto ? autoDim(rec.bright) : rec.dim);

  function urlFor(rec) {
    const old = urls.get(rec.id);
    if (old && old.ts === rec.ts) return old.url;
    if (old) URL.revokeObjectURL(old.url);
    const url = URL.createObjectURL(rec.view);
    urls.set(rec.id, { url, ts: rec.ts });
    return url;
  }
  function clearBg() {
    const bg = $('#bg');
    bg.style.backgroundImage = ''; bg.style.filter = ''; bg.style.transform = '';
    $('#bgdim').style.opacity = '0';
  }
  function applyLook(rec) {
    const bg = $('#bg');
    $('#bgdim').style.opacity = String(dimOf(rec) / 100);
    const b = rec.blur || 0;
    bg.style.filter = b ? 'blur(' + b + 'px)' : '';
    bg.style.transform = b ? 'scale(1.1)' : '';
  }
  async function apply(fid) {
    const tok = ++token;
    if (fid !== shownFid) clearBg();
    shownFid = fid;
    if (!fid) return;
    let rec = null;
    try { rec = await dbGet(fid); } catch (e) { clearBg(); return; }
    if (tok !== token) return;
    if (!rec || !rec.view) { clearBg(); return; }
    $('#bg').style.backgroundImage = 'url("' + urlFor(rec) + '")';
    applyLook(rec);
  }
  async function cleanup(validIds) {
    try {
      const keys = await dbKeys();
      const ok = new Set(validIds);
      ok.add(HOME);
      for (const k of keys) {
        if (!ok.has(k)) {
          await dbDel(k);
          const u = urls.get(k); if (u) { URL.revokeObjectURL(u.url); urls.delete(k); }
        }
      }
    } catch (e) {}
  }

  // ------------------------------------------------------------------ image helpers
  function viewAspect() {   // phone screen height / width, the same in Safari and Home Screen mode
    const sw = screen.width || 390, sh = screen.height || 844;
    return Math.min(2.4, Math.max(1.4, Math.max(sw, sh) / Math.min(sw, sh)));
  }
  async function decode(file) {
    if (window.createImageBitmap) {
      let bmp = null;
      try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
      catch (e) { try { bmp = await createImageBitmap(file); } catch (e2) {} }
      if (bmp) return { src: bmp, w: bmp.width, h: bmp.height };
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { src: img, w: img.naturalWidth, h: img.naturalHeight };
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const toBlob = (canvas, q) => new Promise(r => canvas.toBlob(r, 'image/jpeg', q));
  async function shrink(file) {   // keep the long side at 1600 px so storage stays small
    const d = await decode(file);
    const k = Math.min(1, 1600 / Math.max(d.w, d.h));
    const w = Math.max(1, Math.round(d.w * k)), h = Math.max(1, Math.round(d.h * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(d.src, 0, 0, w, h);
    if (d.src.close) d.src.close();
    const blob = await toBlob(c, 0.88);
    if (!blob) throw new Error('could not encode image');
    return { blob, w, h };
  }
  function brightness(canvas) {
    const c = document.createElement('canvas');
    c.width = 24; c.height = 42;
    const g = c.getContext('2d');
    g.drawImage(canvas, 0, 0, 24, 42);
    const d = g.getImageData(0, 0, 24, 42).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    return sum / (d.length / 4);
  }
  function smallCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // Fills a canvas with a soft, darkened, blurred copy of the photo (used where the photo does not reach the edges).
  // Works by shrinking the photo and growing it back in steps, so it does not need CanvasRenderingContext2D.filter.
  function paintBlurFill(g, img, w, h, outW, outH) {
    const sW = 24, sH = Math.max(8, Math.round(24 * outH / outW));
    const mid = smallCanvas(sW * 4, sH * 4);
    const k = Math.max(mid.width / w, mid.height / h);
    const mg = mid.getContext('2d');
    mg.imageSmoothingQuality = 'high';
    mg.drawImage(img, (mid.width - w * k) / 2, (mid.height - h * k) / 2, w * k, h * k);
    let cur = smallCanvas(sW, sH);
    const cg = cur.getContext('2d');
    cg.imageSmoothingQuality = 'high';
    cg.drawImage(mid, 0, 0, sW, sH);
    while (cur.width < outW) {
      const nw = Math.min(outW, cur.width * 3);
      const nh = Math.max(1, Math.round(cur.height * nw / cur.width));
      const n = smallCanvas(nw, nh);
      const ng = n.getContext('2d');
      ng.imageSmoothingEnabled = true; ng.imageSmoothingQuality = 'high';
      ng.drawImage(cur, 0, 0, nw, nh);
      cur = n;
    }
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, outW, outH);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, outW, outH);
  }

  // ------------------------------------------------------------------ crop screen
  function cropper(srcBlob, w, h, startCrop, onDone, onCancel) {
    const aspect = viewAspect();
    const ov = document.createElement('div');
    ov.id = 'wpCropOv';
    ov.innerHTML =
      '<div class="wpc-top"><button class="wpc-btn" id="wpcCancel" type="button">Cancel</button><div class="wpc-title">Move and zoom</div><button class="wpc-btn pri" id="wpcDone" type="button">Done</button></div>' +
      '<div class="wpc-stage" id="wpcStage"><div class="wpc-frame" id="wpcFrame"><canvas id="wpcBg"></canvas><img id="wpcImg" alt="" draggable="false"></div></div>' +
      '<div class="wpc-bottom"><div class="wpc-hint">Drag to move. Pinch or use the slider to zoom in or out. The frame is your screen.</div>' +
      '<input type="range" id="wpcZoom" min="100" max="500" value="100" aria-label="Zoom"></div>';
    document.body.appendChild(ov);
    document.body.classList.add('noscroll');

    const frame = $('#wpcFrame', ov), img = $('#wpcImg', ov), stage = $('#wpcStage', ov), zoom = $('#wpcZoom', ov), bgc = $('#wpcBg', ov);
    const imgUrl = URL.createObjectURL(srcBlob);
    // scales: coverS fills the frame, containS shows the whole photo (zoomed out), maxS is the most you can zoom in
    let fw = 0, fh = 0, coverS = 1, minS = 1, maxS = 5, s = 1, x = 0, y = 0, ready = false;

    function clampXY() {
      const iw = w * s, ih = h * s;
      x = iw <= fw ? (fw - iw) / 2 : Math.min(0, Math.max(fw - iw, x));
      y = ih <= fh ? (fh - ih) / 2 : Math.min(0, Math.max(fh - ih, y));
    }
    function draw() {
      img.style.width = (w * s) + 'px';
      img.style.height = (h * s) + 'px';
      img.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      zoom.value = String(Math.round(s / coverS * 100));
    }
    function zoomAt(cx, cy, ns) {
      ns = Math.min(maxS, Math.max(minS, ns));
      const px = (cx - x) / s, py = (cy - y) / s;
      s = ns; x = cx - px * s; y = cy - py * s;
      clampXY(); draw();
    }
    function layout() {
      const r = stage.getBoundingClientRect();
      const availW = Math.max(120, r.width - 24), availH = Math.max(160, r.height - 16);
      fh = availH; fw = fh / aspect;
      if (fw > availW) { fw = availW; fh = fw * aspect; }
      fw = Math.floor(fw); fh = Math.floor(fh);
      frame.style.width = fw + 'px'; frame.style.height = fh + 'px';
      coverS = Math.max(fw / w, fh / h);
      minS = Math.min(fw / w, fh / h);
      maxS = coverS * 5;
      zoom.min = String(Math.max(5, Math.floor(minS / coverS * 100)));
      zoom.max = '500';
      if (!ready) {
        if (startCrop) {
          s = Math.min(maxS, Math.max(minS, fw / (startCrop.sw * w)));
          x = -startCrop.x0 * w * s; y = -startCrop.y0 * h * s;
        } else {
          s = coverS; x = (fw - w * s) / 2; y = (fh - h * s) / 2;
        }
        bgc.width = fw; bgc.height = fh;
        paintBlurFill(bgc.getContext('2d'), img, w, h, fw, fh);
      } else {
        s = Math.min(maxS, Math.max(minS, s));
      }
      ready = true;
      clampXY(); draw();
    }
    img.onload = () => requestAnimationFrame(layout);
    img.src = imgUrl;

    // drag + pinch
    const pts = new Map();
    let lastDist = 1, lastMid = null;
    frame.addEventListener('pointerdown', e => {
      try { frame.setPointerCapture(e.pointerId); } catch (err) {}
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        lastDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
      e.preventDefault();
    });
    frame.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId);
      if (!p || !ready) return;
      const px = p.x, py = p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 1) {
        x += p.x - px; y += p.y - py; clampXY(); draw();
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const r = frame.getBoundingClientRect();
        x += mid.x - lastMid.x; y += mid.y - lastMid.y;
        zoomAt(mid.x - r.left, mid.y - r.top, s * d / lastDist);
        lastDist = d; lastMid = mid;
      }
      e.preventDefault();
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) lastMid = null; };
    frame.addEventListener('pointerup', up);
    frame.addEventListener('pointercancel', up);
    frame.addEventListener('wheel', e => {
      e.preventDefault();
      const r = frame.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, s * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    }, { passive: false });
    zoom.addEventListener('input', () => zoomAt(fw / 2, fh / 2, coverS * (+zoom.value) / 100));

    function close() {
      URL.revokeObjectURL(imgUrl);
      ov.remove();
      document.body.classList.remove('noscroll');
    }
    $('#wpcCancel', ov).addEventListener('click', () => { close(); onCancel && onCancel(); });
    $('#wpcDone', ov).addEventListener('click', async () => {
      if (!ready) return;
      // the visible frame, expressed in photo coordinates (can extend past the photo when zoomed out)
      const crop = { x0: -x / (w * s), y0: -y / (h * s), sw: fw / (w * s), sh: fh / (h * s) };
      const outW = 900, outH = Math.round(outW * aspect);
      const c = smallCanvas(outW, outH);
      const g = c.getContext('2d');
      paintBlurFill(g, img, w, h, outW, outH);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(img, x * outW / fw, y * outH / fh, w * s * outW / fw, h * s * outH / fh);
      const view = await toBlob(c, 0.86);
      const bright = brightness(c);
      close();
      onDone({ crop, view, bright });
    });
  }

  // ------------------------------------------------------------------ editor sheet
  async function openEditor(fid) {
    const f = fid === HOME ? { id: HOME, name: 'Home screen', color: '#64748b' } : HW.getFolder(fid);
    if (!f) return;
    let rec = null;
    try { rec = await dbGet(fid); }
    catch (e) { HW.toast('Wallpapers are unavailable because storage is blocked.'); return; }
    show(rec);

    function save(r) {
      return dbPut(r).catch(() => HW.toast('Could not save the wallpaper. Storage may be full or blocked.'));
    }
    function show(r) {
      const has = !!(r && r.view);
      HW.openSheet(
        '<h2>Wallpaper</h2><div class="sub"><span class="chip" style="--c:' + f.color + '">' + HW.esc(f.name) + '</span></div>' +
        '<div class="wpPrev" style="--c:' + f.color + '"><div class="wpPrevBg" id="wpPrevBg"></div><div class="wpPrevDim" id="wpPrevDim"></div>' +
        (has ? '' : '<div class="wpEmpty">No wallpaper yet</div>') +
        '<div class="wpPrevIn"><div class="wpPrevT">' + HW.esc(f.name) + '</div><div class="wpPrevCard"></div><div class="wpPrevCard"></div><div class="wpPrevCard"></div></div></div>' +
        '<input type="file" id="wpFile" accept="image/*" hidden>' +
        '<div class="btns"><button class="btn" type="button" id="wpPick">' + (has ? 'Choose a different photo' : 'Choose photo') + '</button>' +
        (has ? '<button class="btn sec" type="button" id="wpCropBtn">Adjust crop</button>' : '') + '</div>' +
        '<div class="msg" id="wpMsg"></div>' +
        (has ?
          '<h3>Readability</h3>' +
          '<label><span>Dimming: <b id="wpDimV"></b></span><input type="range" id="wpDim" min="0" max="85" step="1"></label>' +
          '<div class="btns" style="margin:10px 0 14px"><button class="btn sec" type="button" id="wpAuto">Auto-adjust for this photo</button></div>' +
          '<label><span>Blur: <b id="wpBlurV"></b></span><input type="range" id="wpBlur" min="0" max="12" step="1"></label>' +
          '<div class="note" style="margin-top:8px">Dimming and blur make text easier to read over busy or bright photos. Cards stay solid unless you lower their opacity in Settings.</div>' +
          '<button class="btn danger wide" type="button" id="wpDel">Remove wallpaper</button>' : '') +
        '<button class="btn ghost wide" type="button" data-close>Done</button>' +
        '<div class="note" style="margin-top:10px">Wallpapers are stored only on this phone and are not part of backups.</div>',
        () => {
          const msg = (t, err) => { const m = $('#wpMsg'); if (m) { m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); } };
          function paintPreview() {
            if (!has) return;
            $('#wpPrevBg').style.backgroundImage = 'url("' + urlFor(r) + '")';
            $('#wpPrevDim').style.opacity = String(dimOf(r) / 100);
            $('#wpPrevBg').style.filter = r.blur ? 'blur(' + Math.max(1, Math.round(r.blur / 3)) + 'px)' : '';
            $('#wpDim').value = String(dimOf(r));
            $('#wpDimV').textContent = dimOf(r) + '%' + (r.auto ? ' (auto)' : '');
            $('#wpBlur').value = String(r.blur || 0);
            $('#wpBlurV').textContent = (r.blur || 0) ? r.blur + ' px' : 'off';
          }
          paintPreview();

          $('#wpPick').addEventListener('click', () => $('#wpFile').click());
          $('#wpFile').addEventListener('change', async e => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            msg('Preparing photo…');
            let sh;
            try { sh = await shrink(file); }
            catch (err) { msg('That photo could not be opened. Try a different one.', true); return; }
            HW.closeSheet();
            cropper(sh.blob, sh.w, sh.h, null,
              async res => {
                const nrec = {
                  id: fid, src: sh.blob, srcW: sh.w, srcH: sh.h, view: res.view, crop: res.crop,
                  bright: res.bright, auto: true, dim: autoDim(res.bright), blur: (r && r.blur) || 0, ts: Date.now()
                };
                await save(nrec);
                await apply(fid);
                openEditor(fid);
              },
              () => openEditor(fid));
          });

          if (has) {
            $('#wpCropBtn').addEventListener('click', () => {
              HW.closeSheet();
              cropper(r.src, r.srcW, r.srcH, r.crop,
                async res => {
                  const nrec = Object.assign({}, r, { view: res.view, crop: res.crop, bright: res.bright, ts: Date.now() });
                  if (nrec.auto) nrec.dim = autoDim(res.bright);
                  await save(nrec);
                  await apply(fid);
                  openEditor(fid);
                },
                () => openEditor(fid));
            });
            $('#wpDim').addEventListener('input', e => {
              r.auto = false; r.dim = +e.target.value; applyLook(r); paintPreview();
            });
            $('#wpDim').addEventListener('change', () => save(r));
            $('#wpAuto').addEventListener('click', () => { r.auto = true; r.dim = autoDim(r.bright); applyLook(r); paintPreview(); save(r); });
            $('#wpBlur').addEventListener('input', e => { r.blur = +e.target.value; applyLook(r); paintPreview(); });
            $('#wpBlur').addEventListener('change', () => save(r));
            $('#wpDel').addEventListener('click', async () => {
              if (!confirm('Remove the wallpaper from "' + f.name + '"?')) return;
              try { await dbDel(fid); } catch (err) {}
              const u = urls.get(fid); if (u) { URL.revokeObjectURL(u.url); urls.delete(fid); }
              clearBg();
              openEditor(fid);
            });
          }
        }
      );
    }
  }

  window.WP = { apply, openEditor, cleanup };
})();
