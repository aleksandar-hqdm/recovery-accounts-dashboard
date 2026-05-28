/* Shared renderer for the single-screen "Client" snapshot report.
   Reads ./data/data.json -> `snapshot` block (written by _build_snapshots.py) and builds
   the full DOM + charts into #snap-root. One renderer for every client.

   snapshot block shape:
   {
     eyebrow, title, subtitle, exec_html,
     chips: [{v,l,good|watch}],
     line:    {labels[], visitors[], leads[], leads_label, visitors_label, partial_index},
     quarters:{labels[], visitors[], leads[], leads_label, partial_index},
     boxes: [{win, cmp, kind:'good'|'watch'|'', rows:[{m,d,cls}], extra:{m,d,cls}|null}],
     boxes_reading_html,
     maps:        {enabled, title, window, headers:[], rows:[{me, cells:[{t,c}]}], note_html},
     competitors: {enabled, title, window, headers:[], rows:[{me, cells:[{t,c}]}], note_html},
     focus: [{title, body, color}]
   }
*/
(async function () {
  const root = document.getElementById('snap-root');
  const DATA = await fetch('./data/data.json?v=' + Date.now()).then(r => r.json()).catch(() => null);
  if (!DATA || !DATA.snapshot) {
    root.innerHTML = '<div style="max-width:680px;margin:3rem auto;padding:1.5rem;border:1px solid #fde68a;background:#fffbeb;border-radius:.5rem;color:#92400e;font-family:Inter,sans-serif">This client’s snapshot data hasn’t been generated yet. Run <code>_build_snapshots.py</code>.</div>';
    return;
  }
  const s = DATA.snapshot;
  if (s.title) document.title = s.title + ' · Client Snapshot';

  const eng = DATA && DATA.trend && DATA.trend.engagement_signals;
  root.innerHTML = buildHTML(s, eng);
  if (s.line) renderLine(s.line);
  if (s.quarters) renderQuarter(s.quarters);
  if (eng && eng.enabled && document.getElementById('snap-engagement-chart')) {
    renderEngagement(eng, (DATA.trend && DATA.trend.months) || eng.months || []);
  }

  // ---------------- DOM ----------------
  function chip(c) {
    return `<span class="chip ${c.good ? 'good' : (c.watch ? 'watch' : '')}"><span class="v">${c.v}</span><span class="l">${c.l}</span></span>`;
  }
  function boxEl(b) {
    const rows = (b.rows || []).map(r => `<div class="row"><span class="m">${r.m}</span><span class="d ${r.cls || ''}">${r.d}</span></div>`).join('');
    const extra = b.extra ? `<div class="row extra"><span class="m">${b.extra.m}</span><span class="d ${b.extra.cls || ''}">${b.extra.d}</span></div>` : '';
    return `<div class="mbox ${b.kind || ''}"><div class="win">${b.win}</div><div class="cmp">${b.cmp || ''}</div>${rows}${extra}</div>`;
  }
  function tablePanel(t) {
    const head = `<tr>${t.headers.map((h, i) => `<th${i === 0 ? '' : ''}>${h}</th>`).join('')}</tr>`;
    const body = t.rows.map(r => `<tr class="${r.me ? 'me' : ''}">${r.cells.map(c => `<td class="${c.c || ''}">${c.t}</td>`).join('')}</tr>`).join('');
    return `<div class="panel p-3.5">
      <div class="secthead mb-1">${t.title}</div>
      ${t.window ? `<p class="text-[11px] text-slate-500 mb-2">${t.window}</p>` : ''}
      <table class="mv"><thead>${head}</thead><tbody>${body}</tbody></table>
      ${t.note_html ? `<p class="text-[11px] text-slate-500 mt-2">${t.note_html}</p>` : ''}
    </div>`;
  }
  function focusCard(f) {
    return `<div class="focus-card" style="border-left-color:${f.color || '#1d5b8a'};"><div class="ft">${f.title}</div><div class="fb">${f.body}</div></div>`;
  }
  function calendarHTML(c) {
    if (!c || !c.enabled) return '';
    const months = (c.months || []).map(m => `<th class="month">${m}</th>`).join('');
    const itemHTML = it => {
      const tag = `<span class="tag ${it.k || 'fix'}">${it.k || ''}</span>`;
      const note = it.n ? ` <span class="n">— ${it.n}</span>` : '';
      return `<div class="item">${tag}<div><span class="u">${it.u}</span>${note}</div></div>`;
    };
    const rows = (c.rows || []).map(r => {
      const cells = (r.cells || []).map(items => `<td>${(items || []).map(itemHTML).join('')}</td>`).join('');
      return `<tr><td class="row-label">${r.label}<span class="cap">${r.cap || ''}</span></td>${cells}</tr>`;
    }).join('');
    return `<section class="mb-3">
      <div class="panel p-3.5">
        <div class="secthead mb-1">${c.title || 'Build Calendar · Next 90 Days'}</div>
        ${c.subtitle ? `<p class="text-[11px] text-slate-500 mb-2">${c.subtitle}</p>` : ''}
        <div class="overflow-x-auto"><table class="cal"><thead><tr><th></th>${months}</tr></thead><tbody>${rows}</tbody></table></div>
        ${c.note_html ? `<p class="text-[11px] text-slate-500 mt-3">${c.note_html}</p>` : ''}
      </div>
    </section>`;
  }

  function buildHTML(s, eng) {
    // Three optional table panels: maps / anchor_towns_table / competitors.
    // Each is rendered only when present + enabled. anchor_towns_table is the
    // newer "where the brand structurally already wins" view; layout scales
    // 1/2/3-up so the grid stays balanced no matter which subset is present.
    const tablesList = [s.maps, s.anchor_towns_table, s.competitors].filter(t => t && t.enabled);
    const tablesOn = tablesList.length;
    const tablesGrid = tablesOn >= 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-1';
    const tablesHtml = tablesList.map(tablePanel).join('');
    const engagementHtml = (eng && eng.enabled) ? `
      <section class="mb-3">
        <div class="panel p-3.5">
          <div class="flex items-end justify-between mb-1 flex-wrap gap-2">
            <div class="secthead">Engagement Signals · GMB &amp; Phone Clicks</div>
            <span class="text-[10px] text-slate-400">monthly · intent signals, not confirmed conversions</span>
          </div>
          <div style="height: 140px;"><canvas id="snap-engagement-chart"></canvas></div>
          <p class="text-[11px] text-slate-500 mt-2" id="snap-engagement-caption"></p>
        </div>
      </section>` : '';
    const focusCols = Math.min(Math.max((s.focus || []).length, 1), 4);
    // Header nav: client-facing dashboard repo has no condensed/strategy pages to link to.
    const condensed = (s.nav && 'condensed' in s.nav) ? s.nav.condensed : false;
    const strategy  = (s.nav && 'strategy'  in s.nav) ? s.nav.strategy  : false;
    const condensedHTML = condensed ? `<a href="${condensed.href}" class="text-brand-500 font-semibold hover:underline">${condensed.label}</a>` : '';
    const strategyHTML  = strategy  ? `<a href="${strategy.href}"  class="text-slate-500 hover:text-slate-900 hidden sm:inline">${strategy.label}</a>` : '';
    // Layout: when there's no quarters chart, line chart goes full width and
    // boxes (Last 90 Days / YoY pills) drop into their own section below.
    const hasQuarters = !!(s.quarters && Array.isArray(s.quarters.visitors) && s.quarters.visitors.length);
    const hasLine = !!(s.line && Array.isArray(s.line.visitors) && s.line.visitors.length);
    const hasBoxes = !!(s.boxes && s.boxes.length);
    const boxCols = Math.min(s.boxes ? s.boxes.length : 0, 3);
    return `
    <header class="no-print sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div class="snap-shell mx-auto px-4 sm:px-6 py-2 flex items-center justify-between text-xs">
        <div class="flex items-center gap-2 min-w-0">
          <span class="font-semibold truncate">${s.title}</span>
          <span class="text-slate-400 hidden sm:inline">· ${s.subtitle || 'Client Snapshot'}</span>
        </div>
        <div class="flex items-center gap-3">
          ${condensedHTML}
          ${strategyHTML}
          <button onclick="window.print()" class="px-2.5 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-50">Print / PDF</button>
        </div>
      </div>
    </header>

    <main class="snap-shell mx-auto px-4 sm:px-6 py-4">
      <section class="mb-3">
        <div class="text-[10px] font-bold uppercase tracking-widest text-brand-500 mb-1">${s.eyebrow || 'HQDM Search Intelligence'}</div>
        <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-1">
          <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">${s.title}</h1>
          ${s.subtitle ? `<div class="text-sm text-slate-500">${s.subtitle}</div>` : ''}
        </div>
        <div class="panel mt-2.5 p-3.5" style="background: linear-gradient(180deg,#ffffff 0%,#f0fdf4 100%);">
          <div class="text-[15px] leading-relaxed text-slate-800">${s.exec_html || ''}</div>
          ${(s.chips && s.chips.length) ? `<div class="flex flex-wrap gap-2 mt-3">${s.chips.map(chip).join('')}</div>` : ''}
        </div>
      </section>

      ${(hasLine && hasQuarters) ? `
      <section class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-3">
        <div class="panel p-3.5">
          <div class="secthead mb-2">${(s.line && s.line.title) || 'Organic Performance · Monthly'}</div>
          <div style="height: 184px;"><canvas id="line-chart"></canvas></div>
          ${(s.line && s.line.caption) ? `<p class="text-[11px] text-slate-500 mt-2">${s.line.caption}</p>` : ''}
        </div>
        <div class="panel p-3.5">
          <div class="secthead mb-2">${s.quarters.title || 'By Quarter'}</div>
          <div style="height: 132px;"><canvas id="quarter-chart"></canvas></div>
          ${hasBoxes ? `<div class="grid grid-cols-3 gap-2 mt-3">${s.boxes.map(boxEl).join('')}</div>` : ''}
          ${s.boxes_reading_html ? `<p class="text-[11px] text-slate-500 mt-2">${s.boxes_reading_html}</p>` : ''}
        </div>
      </section>` : hasQuarters ? `
      <section class="mb-3">
        <div class="panel p-3.5">
          <div class="secthead mb-2">${s.quarters.title || 'By Quarter'}</div>
          <div style="height: 220px;"><canvas id="quarter-chart"></canvas></div>
          ${hasBoxes ? `<div class="grid grid-cols-1 sm:grid-cols-${boxCols} gap-3 mt-3">${s.boxes.map(boxEl).join('')}</div>` : ''}
          ${s.boxes_reading_html ? `<p class="text-[11px] text-slate-500 mt-3">${s.boxes_reading_html}</p>` : ''}
        </div>
      </section>` : `
      <section class="mb-3">
        <div class="panel p-3.5">
          <div class="secthead mb-2">${(s.line && s.line.title) || 'Organic Performance · Monthly'}</div>
          <div style="height: 300px;"><canvas id="line-chart"></canvas></div>
          ${(s.line && s.line.caption) ? `<p class="text-[11px] text-slate-500 mt-2">${s.line.caption}</p>` : ''}
        </div>
      </section>
      ${hasBoxes ? `<section class="mb-3">
        <div class="panel p-3.5">
          <div class="grid grid-cols-1 sm:grid-cols-${boxCols} gap-3">${s.boxes.map(boxEl).join('')}</div>
          ${s.boxes_reading_html ? `<p class="text-[11px] text-slate-500 mt-3">${s.boxes_reading_html}</p>` : ''}
        </div>
      </section>` : ''}`}

      ${tablesOn ? `<section class="grid grid-cols-1 ${tablesGrid} gap-4 mb-3">${tablesHtml}</section>` : ''}

      ${engagementHtml}

      ${(s.focus && s.focus.length) ? `<section class="mb-3">
        <div class="secthead mb-2">${s.focus_heading || 'Our Focus · Next 90 Days'}</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${focusCols} gap-3">${s.focus.map(focusCard).join('')}</div>
      </section>` : ''}

      ${calendarHTML(s.calendar)}

      <footer class="mt-4 pt-3 border-t border-slate-200 text-[10px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
        <div><span class="font-semibold text-slate-700">HQDM Search Intelligence</span> · ${s.footer || 'Client snapshot'}</div>
        <div class="text-slate-400">Confidential — for ${s.short_name || s.title} only.</div>
      </footer>
    </main>`;
  }

  // ---------------- Charts ----------------
  function splitPartial(arr, pIdx) {
    if (pIdx == null || pIdx < 0) return { solid: arr, dashed: arr.map(() => null) };
    return {
      solid: arr.map((v, i) => i <= pIdx - 1 ? v : null),
      dashed: arr.map((v, i) => i >= pIdx - 1 ? v : null),
    };
  }
  function renderLine(l) {
    const hasLeads = Array.isArray(l.leads) && l.leads.length > 0;
    const ds = (sp, color, label, axis) => ([
      { label, data: sp.solid, borderColor: color, backgroundColor: color + '18', yAxisID: axis, borderWidth: 3, tension: 0.25, pointRadius: 2.5, pointHoverRadius: 6, fill: true, spanGaps: false },
      { label: label + ' (partial)', data: sp.dashed, borderColor: color, backgroundColor: 'transparent', yAxisID: axis, borderDash: [5, 4], borderWidth: 2.5, tension: 0.25, pointRadius: 2.5, pointHoverRadius: 6, fill: false, spanGaps: false },
    ]);
    const datasets = ds(splitPartial(l.visitors, l.partial_index), '#1d5b8a', l.visitors_label || 'Organic visitors', 'y');
    if (hasLeads) datasets.push(...ds(splitPartial(l.leads, l.partial_index), '#10b981', l.leads_label || 'Organic leads', 'y1'));
    const scales = {
      x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: false } },
      y: { position: 'left', beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 9 } }, title: { display: true, text: l.visitors_label || 'visitors', font: { size: 9, weight: '600' }, color: '#1d5b8a' } },
    };
    if (hasLeads) scales.y1 = { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { font: { size: 9 } }, title: { display: true, text: l.leads_label || 'leads', font: { size: 9, weight: '600' }, color: '#10b981' } };
    new Chart(document.getElementById('line-chart'), {
      type: 'line',
      data: { labels: l.labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: hasLeads, position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12, filter: i => !/partial/.test(i.text) } },
          tooltip: { backgroundColor: '#0b1220', padding: 9, callbacks: { label: c => `${c.dataset.label.replace(' (partial)', '')}: ${c.raw != null ? c.raw.toLocaleString() : '—'}` } },
        },
        scales,
      },
    });
  }
  function renderQuarter(q) {
    const hasLeads = Array.isArray(q.leads) && q.leads.length > 0;
    const partialColors = q.visitors.map((_, i) => i === q.partial_index ? '#9ec5e0' : '#1d5b8a');
    const datasets = [{ type: 'bar', label: q.visitors_label || 'Visitors', data: q.visitors, yAxisID: 'y', order: 2, backgroundColor: partialColors, borderRadius: 3, barPercentage: 0.78, categoryPercentage: 0.8 }];
    if (hasLeads) datasets.push({ type: 'line', label: q.leads_label || 'Leads', data: q.leads, yAxisID: 'y1', order: 1, borderColor: '#10b981', backgroundColor: '#10b981', borderWidth: 2.5, tension: 0.25, pointRadius: 2.5, pointHoverRadius: 6 });
    const scales = {
      x: { grid: { display: false }, ticks: { font: { size: 9 } } },
      y: { position: 'left', beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 9 } } },
    };
    if (hasLeads) scales.y1 = { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { font: { size: 9 } } };
    new Chart(document.getElementById('quarter-chart'), {
      type: 'bar',
      data: { labels: q.labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: hasLeads, position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } }, tooltip: { backgroundColor: '#0b1220', padding: 9 } },
        scales,
      },
    });
  }
  function renderEngagement(eng, months) {
    const ctx = document.getElementById('snap-engagement-chart');
    if (!ctx) return;
    const partialIdx = months.findIndex(m => /\*/.test(m));
    const datasets = [];
    const caps = [];
    for (const key of Object.keys(eng.series)) {
      const sObj = eng.series[key];
      const solid = sObj.data.map((v, i) => (partialIdx >= 0 && i >= partialIdx ? null : v));
      const dashed = sObj.data.map((v, i) => (partialIdx >= 0 && i >= partialIdx - 1 ? v : null));
      datasets.push({ label: sObj.label, data: solid, borderColor: sObj.color, backgroundColor: sObj.color + '18',
        tension: 0.25, borderWidth: 2.5, pointRadius: 1.5, pointHoverRadius: 4, spanGaps: false, fill: false });
      datasets.push({ label: sObj.label + ' (partial)', data: dashed, borderColor: sObj.color, borderDash: [5, 4],
        tension: 0.25, borderWidth: 2, pointRadius: 1.5, spanGaps: false, fill: false });
      if (sObj.caption) caps.push(`${sObj.label}: ${sObj.caption}`);
    }
    new Chart(ctx, {
      type: 'line',
      data: { labels: months, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { font: { size: 9 }, boxWidth: 10, filter: i => !/partial/.test(i.text) } },
          tooltip: { backgroundColor: '#0b1220', padding: 9, callbacks: { label: c => `${c.dataset.label.replace(' (partial)', '')}: ${c.raw != null ? c.raw.toLocaleString() : '—'}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 8 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 9 } } },
        },
      },
    });
    const capEl = document.getElementById('snap-engagement-caption');
    if (capEl) capEl.textContent = (eng.annotation_text || '') + (caps.length ? ' · ' + caps.join(' · ') : '');
  }
})();
