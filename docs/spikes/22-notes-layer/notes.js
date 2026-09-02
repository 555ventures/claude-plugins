// Annotation layer, per mock screen. Injected at serve time; never lives in mock markup.
// Anchor = page (journey/screen) + frame (state label). No element paths, no pixel positions.
(() => {
  if (new URLSearchParams(location.search).has('clean')) return; // screenshots stay clean
  const page = location.pathname.replace(/^\//, '');
  const css = `
  /* viewer chrome = shadcn default tokens (zinc), plain CSS, no build. Never leaks into mocks. */
  :root{--v-bg:#fff;--v-fg:#09090b;--v-muted:#71717a;--v-muted-bg:#f4f4f5;--v-border:#e4e4e7;--v-primary:#18181b;--v-primary-fg:#fafafa;--v-ring:#a1a1aa;--v-radius:6px;--v-font:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,Roboto,sans-serif}
  .nl-bar,.nl-strip,.nl-proj{font:14px/1.45 var(--v-font);color:var(--v-fg);-webkit-font-smoothing:antialiased}
  .nl-bar{position:fixed;top:12px;right:12px;z-index:9999;display:flex;gap:8px;align-items:center;background:var(--v-bg);border:1px solid var(--v-border);border-radius:var(--v-radius);padding:6px 8px 6px 12px;box-shadow:0 1px 2px rgba(0,0,0,.05),0 4px 12px rgba(0,0,0,.06)}
  .nl-bar .badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600}
  .nl-bar .badge i{font-style:normal;display:inline-block;min-width:20px;text-align:center;border-radius:999px;padding:1px 6px;background:var(--v-primary);color:var(--v-primary-fg)}
  .nl-btn{display:inline-flex;align-items:center;height:32px;padding:0 12px;border-radius:var(--v-radius);border:1px solid var(--v-border);background:var(--v-bg);color:var(--v-fg);font:500 13px/1 var(--v-font);cursor:pointer;white-space:nowrap}
  .nl-btn:hover{background:var(--v-muted-bg)}
  .nl-btn.primary{background:var(--v-primary);color:var(--v-primary-fg);border-color:var(--v-primary)}
  .nl-btn.primary:hover{opacity:.9}
  .nl-btn.sm{height:26px;padding:0 8px;font-size:12px}
  .nl-btn.ghost{border-color:transparent;color:var(--v-muted)}
  .nl-strip{width:0;min-width:100%;box-sizing:border-box;overflow-wrap:anywhere;margin:8px 0 16px;border:1px solid var(--v-border);border-radius:var(--v-radius);background:var(--v-bg);padding:8px 10px}
  .nl-strip.empty{border-style:dashed;background:transparent}
  .nl-proj{margin:0 0 16px;border:1px solid var(--v-border);border-radius:var(--v-radius);background:var(--v-bg);padding:10px 12px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
  .nl-proj h4{margin:0 0 6px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px}
  .nl-proj h4 .badge{font-size:11px;font-weight:600;border:1px solid var(--v-border);border-radius:999px;padding:1px 8px;color:var(--v-muted)}
  .nl-strip .n,.nl-proj .n{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-top:1px solid var(--v-border);overflow-wrap:anywhere}
  .nl-strip .n:first-of-type,.nl-proj .n:first-of-type{border-top:0;padding-top:0}
  .nl-strip .n.done,.nl-proj .n.done{color:var(--v-muted);text-decoration:line-through}
  .n b{font-size:11px;font-weight:600;color:var(--v-muted);border:1px solid var(--v-border);border-radius:999px;padding:1px 6px;flex:none;line-height:1.4}
  .n .t{flex:1}
  .n small{display:block;color:var(--v-muted);font-size:12px;margin-top:2px}
  .n .nl-btn{flex:none}
  .nl-strip .add,.nl-proj .add{margin-top:4px}
  .nl-strip textarea,.nl-proj textarea{width:100%;box-sizing:border-box;min-height:72px;font:14px/1.45 var(--v-font);color:var(--v-fg);border:1px solid var(--v-border);border-radius:var(--v-radius);padding:8px 10px;margin:6px 0;resize:vertical;outline:none}
  .nl-strip textarea:focus,.nl-proj textarea:focus{border-color:var(--v-ring);box-shadow:0 0 0 3px rgba(161,161,170,.25)}
  .nl-strip small.hint,.nl-proj small.hint{color:var(--v-muted);font-size:12px}
  .row{display:flex;gap:6px;justify-content:flex-end}
  @media print{.nl-bar,.nl-strip,.nl-proj{display:none!important}}`;
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }));

  const frames = [...document.querySelectorAll('.frame')];
  const stateOf = (f) => (f.querySelector('.label')?.textContent || `frame ${frames.indexOf(f) + 1}`).trim();
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const api = (p, b) => fetch('/__notes/' + p, b ? { method: 'POST', body: JSON.stringify(b) } : undefined).then((r) => r.json());
  let notes = [], showDone = false;
  const bar = document.createElement('div'); bar.className = 'nl-bar'; document.body.appendChild(bar);
  const proj = document.createElement('div'); proj.className = 'nl-proj';
  (document.querySelector('h1') || document.body).insertAdjacentElement('afterend', proj);
  let projNotes = [];
  const strips = frames.map((f) => { const s = document.createElement('div'); s.className = 'nl-strip'; f.appendChild(s); return s; });

  function render() {
    const open = notes.filter((n) => n.status === 'open').length;
    bar.innerHTML = `<span class="badge"><i>${open}</i> open <span style="color:var(--v-muted);font-weight:500">· ${notes.length - open} resolved</span></span>`;
    const sd = Object.assign(document.createElement('button'), { textContent: showDone ? 'Hide resolved' : 'Show resolved', className: 'nl-btn ghost' });
    sd.onclick = () => { showDone = !showDone; render(); };
    const pb = Object.assign(document.createElement('button'), { textContent: '+ Project note', className: 'nl-btn' });
    pb.onclick = () => composeProj(); bar.append(pb, sd);
    const popen = projNotes.filter((n) => n.status === 'open').length;
    const shown = projNotes.filter((n) => n.status === 'open' || showDone);
    proj.innerHTML = `<h4>Project notes <span class="badge">${popen} open</span></h4>` + (shown.length ? '' : '<small class="hint">None. Use “+ Project note” for direction-level remarks that are not about one screen.</small>');
    shown.forEach((n) => {
      const d = document.createElement('div'); d.className = 'n' + (n.status === 'open' ? '' : ' done');
      d.innerHTML = `<b>${n.id}</b><span class="t">${esc(n.text)}<small>${esc(n.by)} · ${n.at.slice(0, 16).replace('T', ' ')}${n.status === 'resolved' ? ' · resolved by ' + esc(n.resolvedBy) : ''}</small></span>`;
      if (n.status === 'open') { const b = document.createElement('button'); b.textContent = 'Resolve'; b.className = 'nl-btn sm'; b.onclick = async () => { await api('resolve', { id: n.id, by: 'JJ' }); await refresh(); }; d.appendChild(b); }
      proj.appendChild(d);
    });
    frames.forEach((f, i) => {
      const s = strips[i]; const mine = notes.filter((n) => n.frame === i && (n.status === 'open' || showDone));
      s.className = 'nl-strip' + (mine.length ? '' : ' empty'); s.innerHTML = '';
      mine.forEach((n) => {
        const d = document.createElement('div'); d.className = 'n' + (n.status === 'open' ? '' : ' done');
        d.innerHTML = `<b>${n.id}</b><span class="t">${esc(n.text)}<small>${esc(n.by)} · ${n.at.slice(0, 16).replace('T', ' ')}${n.status === 'resolved' ? ' · resolved by ' + esc(n.resolvedBy) : ''}</small></span>`;
        if (n.status === 'open') { const b = document.createElement('button'); b.textContent = 'Resolve'; b.className = 'nl-btn sm'; b.onclick = async () => { await api('resolve', { id: n.id, by: 'JJ' }); await refresh(); }; d.appendChild(b); }
        s.appendChild(d);
      });
      const add = document.createElement('button'); add.className = 'nl-btn sm add'; add.textContent = mine.length ? '+ Note' : '+ Note on this state';
      add.onclick = () => compose(f, i, s, add);
      s.appendChild(add);
    });
  }
  function compose(f, i, s, add) {
    add.remove();
    const box = document.createElement('div');
    box.innerHTML = `<textarea placeholder="What's wrong with “${esc(stateOf(f))}”, or what should change?"></textarea><div class="row"><button class="c nl-btn sm">Cancel</button><button class="s nl-btn sm primary">Save</button></div>`;
    s.appendChild(box); const ta = box.querySelector('textarea'); ta.focus();
    box.querySelector('.c').onclick = () => render();
    box.querySelector('.s').onclick = async () => {
      if (!ta.value.trim()) return;
      await api('add', { page, frame: i, state: stateOf(f), text: ta.value.trim(), by: 'JJ' });
      await refresh();
    };
  }
  function composeProj() {
    if (proj.querySelector('textarea')) return;
    const box = document.createElement('div');
    box.innerHTML = `<textarea placeholder="Direction-level: what is wrong with the whole set, or where should it go?"></textarea><div class="row"><button class="c nl-btn sm">Cancel</button><button class="s nl-btn sm primary">Save</button></div>`;
    proj.appendChild(box); const ta = box.querySelector('textarea'); ta.focus();
    box.querySelector('.c').onclick = () => render();
    box.querySelector('.s').onclick = async () => {
      if (!ta.value.trim()) return;
      await api('add', { page: '*', scope: 'project', text: ta.value.trim(), by: 'JJ' });
      await refresh();
    };
  }
  async function refresh() {
    projNotes = await api('list?page=*'); notes = await api('list?page=' + encodeURIComponent(page)); render(); }
  refresh();
})();
