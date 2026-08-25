/* ════════════════════════════════════════════════════════════
   HABITUS — Daily Habit Ledger & Schedule
   Pure Real Data • PWA Support • Client-Side Excel & PDF Reports
═══════════════════════════════════════════════════════════ */

const EMOJIS = [
  '🏃','💧','📚','🧘','🍎','💪','✍️','🛌',
  '🧹','💊','🎯','🎵','🧠','🌿','☀️','🚴',
  '🏋️','🧃','🥗','🚶','⭐','🔥','💡','🎨',
  '📝','🌙','🎲','🏊','🧗','🎸','📷','🌍',
  '⏰','💼','📖','💤','🍽️','☕','🚗','💻',
  '📞','✏️','🛡️','🔋','🧘‍♂️','🥑','🍵','🚀'
];

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const DAYS = [
  'Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'
];

const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const CIRC = 2 * Math.PI * 54; // Progress ring circumference (r=54)

const TT_START = 5 * 60;   // 5:00 AM in minutes
const TT_END   = 23 * 60;  // 11:00 PM in minutes
const TT_SLOT  = 44;       // px per 30-min slot (Day view)
const TT_TOTAL = (TT_END - TT_START) / 30 * TT_SLOT;

let state = {
  habits: [],           // [{ id, name, icon, createdAt }]
  completions: {},      // { 'YYYY-MM-DD': [habitId, ...] } - REAL CLICKS ONLY
  ttBlocks: [],         // [{ id, title, icon, startTime, endTime, habitId, days, date }]
  ttLog: {},            // { 'YYYY-MM-DD': { blockId: 'done' | 'skipped' } }
  gMonth: new Date().getMonth(),
  gYear: new Date().getFullYear(),
  ttDate: new Date(),
  ttView: 'day'
};

let charts = { trend: null, donut: null, bar: null };
let selectedEmoji = EMOJIS[0];
let ttSelectedEmoji = '📅';
let editingBlockId = null;
let nowLineInterval = null;
let deferredPwaPrompt = null;
let selectedExportFormat = 'pdf';

/* ── Persistence (Real Data Only) ────────────────────────── */
function load() {
  try {
    state.habits      = JSON.parse(localStorage.getItem('hbt_habits')      || '[]');
    state.completions = JSON.parse(localStorage.getItem('hbt_completions') || '{}');
    state.ttBlocks    = JSON.parse(localStorage.getItem('hbt_tt_blocks')   || '[]');
    state.ttLog       = JSON.parse(localStorage.getItem('hbt_tt_log')      || '{}');

    // Automatically purge legacy dummy test IDs if any exist
    const dummyIds = ['h_d1', 'h_d2', 'h_d3', 'h_d4', 'h_d5'];
    if (state.habits.some(h => dummyIds.includes(h.id))) {
      state.habits = state.habits.filter(h => !dummyIds.includes(h.id));
      Object.keys(state.completions).forEach(k => {
        state.completions[k] = state.completions[k].filter(id => !dummyIds.includes(id));
        if (!state.completions[k].length) delete state.completions[k];
      });
      state.ttBlocks = state.ttBlocks.filter(b => !b.id.startsWith('tb_d'));
      save();
    }
  } catch(e) {
    state.habits = []; state.completions = {}; state.ttBlocks = []; state.ttLog = {};
  }
}

function save() {
  try {
    localStorage.setItem('hbt_habits',      JSON.stringify(state.habits));
    localStorage.setItem('hbt_completions', JSON.stringify(state.completions));
    localStorage.setItem('hbt_tt_blocks',   JSON.stringify(state.ttBlocks));
    localStorage.setItem('hbt_tt_log',      JSON.stringify(state.ttLog));
    localStorage.setItem('hbt_real_data',   'true');
  } catch(e) {
    console.error('Error saving to localStorage:', e);
  }
}

/* ── Date & Time Helpers ──────────────────────────────────── */
function dk(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function todayDk() {
  const n = new Date();
  return dk(n.getFullYear(), n.getMonth(), n.getDate());
}

function dkFromDate(d) {
  return dk(d.getFullYear(), d.getMonth(), d.getDate());
}

function dimOf(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

function timeToMin(t) {
  const p = t.split(':');
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

function minToTime(m) {
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

function minToDisplay(m) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return h12 + (min ? ':' + String(min).padStart(2, '0') : '') + ' ' + ampm;
}

function topFromMin(m) {
  return (m - TT_START) / 30 * TT_SLOT;
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Habit Check & Streak Logic ───────────────────────────── */
function isChecked(hId, key) {
  return !!(state.completions[key] && state.completions[key].includes(hId));
}

function toggle(hId, key) {
  if (!state.completions[key]) state.completions[key] = [];
  const i = state.completions[key].indexOf(hId);
  if (i === -1) {
    state.completions[key].push(hId);
  } else {
    state.completions[key].splice(i, 1);
    if (state.completions[key].length === 0) delete state.completions[key];
  }
  save();
}

function streak(hId) {
  const today = new Date();
  let d = new Date(today);
  let s = 0;
  if (!isChecked(hId, todayDk())) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 365; i++) {
    const k = dk(d.getFullYear(), d.getMonth(), d.getDate());
    if (isChecked(hId, k)) {
      s++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return s;
}

/* ── Navigation ───────────────────────────────────────────── */
function nav(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('[data-view]').forEach(n => n.classList.remove('active'));

  const targetView = document.getElementById('view-' + view);
  if (targetView) targetView.classList.add('active');

  document.querySelectorAll(`[data-view="${view}"]`).forEach(n => n.classList.add('active'));

  if (view === 'today')     renderToday();
  if (view === 'grid')      renderGrid();
  if (view === 'analytics') renderAnalytics();
  if (view === 'manage')    renderManage();
  if (view === 'timetable') renderTimetable();
}

/* ════════════════════════════════════════════════════════════
   TODAY VIEW
═══════════════════════════════════════════════════════════ */
function renderToday() {
  const now = new Date();
  const subEl = document.getElementById('today-sub');
  if (subEl) {
    subEl.textContent = `${DAYS[now.getDay()].toUpperCase()} · ${MONTHS[now.getMonth()].toUpperCase()} ${now.getDate()}, ${now.getFullYear()}`;
  }

  const key = todayDk();
  const done = state.habits.filter(h => isChecked(h.id, key)).length;
  const total = state.habits.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const arcEl = document.getElementById('ring-arc');
  if (arcEl) arcEl.style.strokeDashoffset = CIRC - (CIRC * pct) / 100;

  const pctEl = document.getElementById('ring-pct');
  if (pctEl) pctEl.textContent = `${pct}%`;

  const countEl = document.getElementById('ring-count');
  if (countEl) countEl.textContent = `${done} / ${total} habits`;

  const dateEl = document.getElementById('ring-date');
  if (dateEl) {
    dateEl.textContent = `${now.getDate()} ${MONTHS[now.getMonth()].substring(0,3).toUpperCase()} ${now.getFullYear()}`;
  }

  const metaEl = document.getElementById('today-meta');
  if (metaEl) {
    metaEl.innerHTML = `${done}/${total} DONE<br>${pct}% COMPLETE`;
  }

  const el = document.getElementById('today-list');
  if (!el) return;

  if (!state.habits.length) {
    el.innerHTML = `
      <div class="empty-list" style="padding: 48px 24px; text-align: center;">
        <div style="font-size: 24px; margin-bottom: 8px;">◈</div>
        <div style="font-weight: 600; color: var(--text-1); font-size: 14px; margin-bottom: 4px;">No Habits Added Yet</div>
        <div style="font-size: 11px; color: var(--text-3); margin-bottom: 16px;">Add your habits in Manage tab to start tracking your real progress.</div>
        <button type="button" class="btn btn-primary" onclick="nav('manage')" style="font-size: 11px; padding: 7px 14px;">+ Add Your First Habit</button>
      </div>`;
    return;
  }

  el.innerHTML = state.habits.map(h => {
    const checked = isChecked(h.id, key);
    const s = streak(h.id);
    const sBadge = s === 0 ? '— 0d' : `🔥 ${s}d`;
    return `
      <div class="habit-row ${checked ? 'done' : ''}" onclick="toggleToday('${h.id}')" role="button" tabindex="0" aria-label="Toggle ${esc(h.name)}">
        <span class="h-icon">${h.icon}</span>
        <span class="h-name">${esc(h.name)}</span>
        <span class="streak-badge ${s === 0 ? 'zero' : ''}">${sBadge}</span>
        <div class="h-check" aria-hidden="true">
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
            <path d="M1 4.5 4 7.5 10 1" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>`;
  }).join('');
}

function toggleToday(hId) {
  toggle(hId, todayDk());
  renderToday();
  if (document.getElementById('view-analytics')?.classList.contains('active')) renderAnalytics();
  if (document.getElementById('view-grid')?.classList.contains('active')) renderGrid();
}

/* ════════════════════════════════════════════════════════════
   MONTHLY GRID VIEW
═══════════════════════════════════════════════════════════ */
function shiftMonth(d) {
  state.gMonth += d;
  if (state.gMonth < 0)  { state.gMonth = 11; state.gYear--; }
  if (state.gMonth > 11) { state.gMonth = 0;  state.gYear++; }
  renderGrid();
}

function renderGrid() {
  const y = state.gYear;
  const m = state.gMonth;
  const lblEl = document.getElementById('grid-lbl');
  if (lblEl) lblEl.textContent = `${MONTHS[m]} ${y}`;

  const d2 = dimOf(y, m);
  const now = new Date();
  const isCur = (now.getFullYear() === y && now.getMonth() === m);

  let html = '<thead><tr><th class="hcol">Habit</th>';
  for (let d = 1; d <= d2; d++) {
    const isTd = isCur && (now.getDate() === d);
    html += `<th class="${isTd ? 'tcol' : ''}">${d}</th>`;
  }
  html += '</tr></thead><tbody>';

  if (!state.habits.length) {
    html += `<tr><td colspan="${d2 + 1}" class="empty-list" style="padding: 40px;">No habits added yet. Go to Manage to add habits.</td></tr>`;
  } else {
    state.habits.forEach(h => {
      html += `<tr><td class="hcol">${h.icon} ${esc(h.name)}</td>`;
      for (let d = 1; d <= d2; d++) {
        const key = dk(y, m, d);
        const future = isCur ? (d > now.getDate()) : (new Date(y, m, d) > now);
        const checked = isChecked(h.id, key);
        const isTd = isCur && (now.getDate() === d);

        if (future) {
          html += `<td><div class="g-cell future" title="Future date">·</div></td>`;
        } else {
          let cls = checked ? 'checked' : '';
          if (isTd) cls += ' today-h';
          html += `<td><div class="g-cell ${cls}" onclick="toggleGrid('${h.id}','${key}')" role="button" aria-label="${h.name} on day ${d}">${checked ? '✓' : ''}</div></td>`;
        }
      }
      html += '</tr>';
    });
  }
  html += '</tbody>';

  const tableEl = document.getElementById('g-table');
  if (tableEl) tableEl.innerHTML = html;

  renderTrend();
}

function toggleGrid(hId, key) {
  toggle(hId, key);
  renderGrid();
  if (document.getElementById('view-today')?.classList.contains('active')) renderToday();
  if (document.getElementById('view-analytics')?.classList.contains('active')) renderAnalytics();
}

function renderTrend() {
  if (typeof Chart === 'undefined') return;

  const y = state.gYear;
  const m = state.gMonth;
  const d2 = dimOf(y, m);
  const now = new Date();
  const labels = [];
  const vals = [];

  for (let d = 1; d <= d2; d++) {
    labels.push(d);
    const future = new Date(y, m, d) > now;
    if (future || !state.habits.length) {
      vals.push(null);
      continue;
    }
    const done = state.habits.filter(h => isChecked(h.id, dk(y, m, d))).length;
    vals.push(Math.round((done / state.habits.length) * 100));
  }

  const canvas = document.getElementById('trend-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (charts.trend) charts.trend.destroy();

  charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: vals,
        borderColor: '#2dd4bf',
        backgroundColor: 'rgba(45,212,191,0.07)',
        borderWidth: 1.5,
        pointRadius: 2.5,
        pointHoverRadius: 5,
        pointBackgroundColor: '#2dd4bf',
        tension: 0.4,
        fill: true,
        spanGaps: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111',
          borderColor: '#2a2a2a',
          borderWidth: 1,
          titleColor: '#888',
          bodyColor: '#f0f0f0',
          callbacks: { label: c => `${c.parsed.y ?? 0}%` }
        }
      },
      scales: {
        x: {
          grid: { color: '#1e1e1e' },
          ticks: { color: '#454545', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 16 }
        },
        y: {
          grid: { color: '#1e1e1e' },
          ticks: { color: '#454545', font: { family: 'JetBrains Mono', size: 10 }, callback: v => v + '%' },
          min: 0,
          max: 100
        }
      }
    }
  });
}

/* ════════════════════════════════════════════════════════════
   ANALYTICS VIEW (REAL DATA ONLY)
═══════════════════════════════════════════════════════════ */
function renderAnalytics() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d2 = dimOf(y, m);
  const elapsed = now.getDate();

  const periodEl = document.getElementById('an-period');
  if (periodEl) {
    periodEl.innerHTML = `${MONTHS[m].toUpperCase()} ${y}<br>Day ${elapsed} of ${d2}`;
  }

  const stats = state.habits.map(h => {
    let actual = 0;
    for (let d = 1; d <= elapsed; d++) {
      if (isChecked(h.id, dk(y, m, d))) actual++;
    }
    const pct = elapsed > 0 ? Math.round((actual / elapsed) * 100) : 0;
    return {
      id: h.id,
      name: h.name,
      icon: h.icon,
      goal: d2,
      actual: actual,
      left: Math.max(0, d2 - actual),
      pct: pct
    };
  });

  const tPoss = state.habits.length * elapsed;
  const tAct  = stats.reduce((s, h) => s + h.actual, 0);
  const ovPct = tPoss > 0 ? Math.round((tAct / tPoss) * 100) : 0;
  const todayDone = state.habits.filter(h => isChecked(h.id, todayDk())).length;
  const bestS = state.habits.length > 0 ? Math.max(...state.habits.map(h => streak(h.id))) : 0;

  const statCardsEl = document.getElementById('stat-cards');
  if (statCardsEl) {
    statCardsEl.innerHTML = `
      <div class="stat-card"><div class="stat-val a">${ovPct}%</div><div class="stat-lbl">Completion</div></div>
      <div class="stat-card"><div class="stat-val">${todayDone}</div><div class="stat-lbl">Done Today</div></div>
      <div class="stat-card"><div class="stat-val">${bestS}</div><div class="stat-lbl">Best Streak</div></div>`;
  }

  const donutPctEl = document.getElementById('donut-pct');
  if (donutPctEl) donutPctEl.textContent = `${ovPct}%`;

  if (typeof Chart !== 'undefined') {
    const donutCanvas = document.getElementById('donut-chart');
    if (donutCanvas) {
      const dCtx = donutCanvas.getContext('2d');
      if (charts.donut) charts.donut.destroy();
      charts.donut = new Chart(dCtx, {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [ovPct, Math.max(0, 100 - ovPct)],
            backgroundColor: ['#2dd4bf', '#1a1a1a'],
            borderWidth: 0
          }]
        },
        options: {
          cutout: '74%',
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          animation: { duration: 800, easing: 'easeInOutQuart' }
        }
      });
    }

    const barCanvas = document.getElementById('bar-chart');
    if (barCanvas) {
      const bCtx = barCanvas.getContext('2d');
      if (charts.bar) charts.bar.destroy();
      if (stats.length) {
        charts.bar = new Chart(bCtx, {
          type: 'bar',
          data: {
            labels: stats.map(h => `${h.icon} ${h.name.substring(0,14)}`),
            datasets: [{
              data: stats.map(h => h.pct),
              backgroundColor: stats.map(h =>
                h.pct >= 80 ? '#2dd4bf' : h.pct >= 50 ? 'rgba(45,212,191,0.5)' : 'rgba(45,212,191,0.2)'
              ),
              borderRadius: 2,
              borderSkipped: false
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#111',
                borderColor: '#2a2a2a',
                borderWidth: 1,
                callbacks: { label: c => `${c.parsed.y}%` }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: '#454545', font: { family: 'JetBrains Mono', size: 9 } }
              },
              y: {
                grid: { color: '#1e1e1e' },
                ticks: { color: '#454545', font: { family: 'JetBrains Mono', size: 9 }, callback: v => v + '%' },
                min: 0,
                max: 100
              }
            }
          }
        });
      }
    }
  }

  const tbody = document.getElementById('an-tbody');
  if (tbody) {
    if (!stats.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-list" style="border:none">No habits tracked yet. Start checking off habits to view insights.</td></tr>';
    } else {
      tbody.innerHTML = stats.map(h => `
        <tr>
          <td><span style="margin-right:8px">${h.icon}</span>${esc(h.name)}</td>
          <td class="r">${h.goal}</td>
          <td class="r" style="color:var(--accent)">${h.actual}</td>
          <td class="r">${h.left}</td>
          <td><div class="pbar-wrap"><div class="pbar-fill" style="width:${h.pct}%"></div></div></td>
          <td class="r" style="color:${h.pct >= 80 ? 'var(--accent)' : 'var(--text-2)'}">${h.pct}%</td>
        </tr>`).join('');
    }
  }

  const sorted = stats.slice().sort((a, b) => b.pct - a.pct);
  const topEl = document.getElementById('top-habits');
  if (topEl) {
    if (!sorted.length) {
      topEl.innerHTML = '<div class="empty-state">No completion data yet</div>';
    } else {
      topEl.innerHTML = sorted.map((h, i) => `
        <div class="top-row">
          <div class="rank ${i === 0 ? 'gold' : ''}">${i + 1}</div>
          <span style="font-size:17px">${h.icon}</span>
          <span class="top-name">${esc(h.name)}</span>
          <div class="top-bar-bg"><div class="top-bar-fg" style="width:${h.pct}%"></div></div>
          <div class="top-pct">${h.pct}%</div>
        </div>`).join('');
    }
  }
}

/* ════════════════════════════════════════════════════════════
   MONTHLY REPORT EXPORT (EXCEL & PDF & AI INSIGHTS)
═══════════════════════════════════════════════════════════ */
function openExportModal() {
  const root = document.getElementById('modal-root');
  if (!root) return;

  const curY = new Date().getFullYear();
  const monthOptions = MONTHS.map((m, i) => `<option value="${i}" ${i === state.gMonth ? 'selected' : ''}>${m}</option>`).join('');
  const yearOptions = [curY - 1, curY, curY + 1].map(y => `<option value="${y}" ${y === state.gYear ? 'selected' : ''}>${y}</option>`).join('');

  root.innerHTML = `
    <div class="modal-overlay" onclick="closeModal()"></div>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="export-modal-title">
      <div class="modal-card" style="max-width:440px">
        <div class="modal-hd">
          <div class="modal-title" id="export-modal-title">Download Monthly Report</div>
          <button type="button" class="modal-close" onclick="closeModal()" aria-label="Close modal">&#10005;</button>
        </div>
        <div class="modal-body" style="padding-top:4px">
          <div class="form-col" style="margin-bottom:14px">
            <label class="form-lbl">Select Month & Year</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <select class="f-input" id="exp-month">${monthOptions}</select>
              <select class="f-input" id="exp-year">${yearOptions}</select>
            </div>
          </div>

          <div class="form-col" style="margin-bottom:16px">
            <label class="form-lbl">Choose Export Format</label>
            <div class="export-format-grid">
              <div class="export-format-card ${selectedExportFormat === 'pdf' ? 'sel' : ''}" id="fmt-pdf-card" onclick="selectExportFormat('pdf')" role="button" tabindex="0">
                <div class="fmt-icon">&#128196;</div>
                <div class="fmt-name">PDF Document</div>
                <div class="fmt-desc">Styled ledger with AI insights & charts</div>
              </div>
              <div class="export-format-card ${selectedExportFormat === 'xlsx' ? 'sel' : ''}" id="fmt-xlsx-card" onclick="selectExportFormat('xlsx')" role="button" tabindex="0">
                <div class="fmt-icon">&#128202;</div>
                <div class="fmt-name">Excel (.xlsx)</div>
                <div class="fmt-desc">Dual sheets: Summary & 31-day Grid</div>
              </div>
            </div>
          </div>

          <div class="export-features-box" style="margin-bottom:18px">
            <div class="ef-item">&#10003; Full 31-Day Ledger Grid</div>
            <div class="ef-item">&#10003; Per-Habit Completion %</div>
            <div class="ef-item">&#10003; AI Consistency Insights</div>
            <div class="ef-item">&#10003; Longest Streaks & Metrics</div>
          </div>

          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" id="exp-submit-btn" onclick="executeExportReport()">
              &#8681; Generate & Download
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

function closeExportModal() {
  closeModal();
}

function selectExportFormat(fmt) {
  selectedExportFormat = fmt;
  document.getElementById('fmt-pdf-card')?.classList.toggle('sel', fmt === 'pdf');
  document.getElementById('fmt-xlsx-card')?.classList.toggle('sel', fmt === 'xlsx');
}

function generateAIInsights(y, m) {
  const d2 = dimOf(y, m);
  const now = new Date();
  const isCurMonth = (now.getFullYear() === y && now.getMonth() === m);
  const activeDays = isCurMonth ? now.getDate() : d2;

  if (!state.habits.length) {
    return {
      summaryText: 'No habits were active during this period. Add habits in the Manage tab to begin tracking consistency trends.',
      topHabit: null,
      strugglingHabit: null,
      ovPct: 0,
      totalCompletions: 0,
      bestStreak: 0,
      stats: []
    };
  }

  const stats = state.habits.map(h => {
    let actual = 0;
    for (let d = 1; d <= activeDays; d++) {
      if (isChecked(h.id, dk(y, m, d))) actual++;
    }
    const pct = activeDays > 0 ? Math.round((actual / activeDays) * 100) : 0;
    return {
      id: h.id,
      name: h.name,
      icon: h.icon,
      goal: d2,
      actual: actual,
      left: Math.max(0, d2 - actual),
      pct: pct,
      streak: streak(h.id)
    };
  });

  const totalPossible = state.habits.length * activeDays;
  const totalCompletions = stats.reduce((sum, h) => sum + h.actual, 0);
  const ovPct = totalPossible > 0 ? Math.round((totalCompletions / totalPossible) * 100) : 0;
  const bestStreak = Math.max(...stats.map(h => h.streak), 0);

  const sorted = stats.slice().sort((a, b) => b.pct - a.pct);
  const topHabit = sorted[0];
  const strugglingHabit = sorted[sorted.length - 1];

  let commentary = `In ${MONTHS[m]} ${y}, you logged ${totalCompletions} habit checkmark${totalCompletions === 1 ? '' : 's'} across ${state.habits.length} tracked habit${state.habits.length === 1 ? '' : 's'}, reaching a ${ovPct}% overall consistency rate. `;

  if (topHabit && topHabit.pct >= 50) {
    commentary += `You were most consistent with "${topHabit.name}" (${topHabit.pct}% completion). `;
  } else if (topHabit) {
    commentary += `Your leading habit was "${topHabit.name}" at ${topHabit.pct}% completion. `;
  }

  if (strugglingHabit && strugglingHabit.id !== topHabit?.id && strugglingHabit.pct < 60) {
    commentary += `Consistency was lower for "${strugglingHabit.name}" (${strugglingHabit.pct}%). `;
    commentary += `Suggestion: Consider habit-stacking "${strugglingHabit.name}" immediately after "${topHabit.name}" or anchoring it to a dedicated morning block in your Timetable to boost adherence.`;
  } else if (ovPct >= 80) {
    commentary += `Outstanding momentum! Your discipline is in the top tier. Keep maintaining your routine triggers.`;
  } else {
    commentary += `Tip: Review your daily timetable to ensure each habit has a dedicated, realistic time-block scheduled.`;
  }

  return {
    summaryText: commentary,
    topHabit,
    strugglingHabit,
    ovPct,
    totalCompletions,
    bestStreak,
    stats
  };
}

function executeExportReport() {
  const m = parseInt(document.getElementById('exp-month')?.value || state.gMonth, 10);
  const y = parseInt(document.getElementById('exp-year')?.value || state.gYear, 10);

  const btn = document.getElementById('exp-submit-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generating...';
  }

  setTimeout(() => {
    try {
      if (selectedExportFormat === 'xlsx') {
        generateExcelReport(y, m);
      } else {
        generatePdfReport(y, m);
      }
      closeExportModal();
    } catch(err) {
      alert('Error generating report: ' + err.message);
      console.error(err);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '&#8681; Generate & Download';
      }
    }
  }, 100);
}

/* ── Client-Side Excel Report Generation ──────────────────── */
function generateExcelReport(y, m) {
  if (typeof XLSX === 'undefined') {
    alert('SheetJS Excel library is not loaded. Please check your internet connection.');
    return;
  }

  const d2 = dimOf(y, m);
  const insights = generateAIInsights(y, m);
  const wb = XLSX.utils.book_new();

  // SHEET 1: Monthly Summary & AI Insights
  const summaryData = [
    ['HABITUS — MONTHLY PERFORMANCE LEDGER'],
    ['Month:', `${MONTHS[m]} ${y}`],
    ['Exported On:', new Date().toLocaleString()],
    ['Overall Completion Rate:', `${insights.ovPct}%`],
    ['Total Checks Logged:', insights.totalCompletions],
    ['Longest Active Streak:', `${insights.bestStreak} days`],
    [],
    ['AI BEHAVIORAL INSIGHTS & SUGGESTIONS:'],
    [insights.summaryText],
    [],
    ['PER-HABIT PERFORMANCE BREAKDOWN'],
    ['Icon', 'Habit Name', 'Monthly Goal (Days)', 'Actual Completed', 'Remaining Days', 'Completion Rate (%)', 'Current Streak (Days)']
  ];

  insights.stats.forEach(h => {
    summaryData.push([
      h.icon,
      h.name,
      h.goal,
      h.actual,
      h.left,
      `${h.pct}%`,
      `${h.streak}d`
    ]);
  });

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 8 }, { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Monthly Summary');

  // SHEET 2: Daily Ledger Grid (1..31)
  const gridHeaders = ['Icon', 'Habit'];
  for (let d = 1; d <= d2; d++) gridHeaders.push(String(d));
  gridHeaders.push('Total Done', 'Completion %');

  const gridData = [
    [`DAILY LEDGER MATRIX — ${MONTHS[m].toUpperCase()} ${y}`],
    [],
    gridHeaders
  ];

  state.habits.forEach(h => {
    let doneCount = 0;
    const row = [h.icon, h.name];
    for (let d = 1; d <= d2; d++) {
      const checked = isChecked(h.id, dk(y, m, d));
      if (checked) doneCount++;
      row.push(checked ? '✓' : '·');
    }
    const pct = d2 > 0 ? Math.round((doneCount / d2) * 100) : 0;
    row.push(doneCount, `${pct}%`);
    gridData.push(row);
  });

  const wsGrid = XLSX.utils.aoa_to_sheet(gridData);
  const colWidths = [{ wch: 6 }, { wch: 24 }];
  for (let d = 1; d <= d2; d++) colWidths.push({ wch: 4 });
  colWidths.push({ wch: 12 }, { wch: 14 });
  wsGrid['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, wsGrid, 'Daily Grid');

  // Download File
  const filename = `Ledger-Report-${MONTHS[m]}-${y}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/* ── Client-Side PDF Report Generation ────────────────────── */
function generatePdfReport(y, m) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('PDF export engine is loading. Please try again in a moment.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const d2 = dimOf(y, m);
  const insights = generateAIInsights(y, m);
  const pageWidth = doc.internal.pageSize.getWidth();
  let curY = 16;

  // Background Theme
  doc.setFillColor(8, 8, 8);
  doc.rect(0, 0, pageWidth, 297, 'F');

  // Header Banner
  doc.setDrawColor(38, 38, 38);
  doc.setFillColor(17, 17, 17);
  doc.roundedRect(12, curY, pageWidth - 24, 26, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(242, 242, 242);
  doc.text('HABITUS', 18, curY + 11);

  doc.setFontSize(9);
  doc.setTextColor(45, 212, 191); // Teal accent
  doc.text('DAILY HABIT LEDGER & PERFORMANCE REPORT', 18, curY + 19);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(242, 242, 242);
  doc.text(`${MONTHS[m]} ${y}`, pageWidth - 18, curY + 11, { align: 'right' });

  doc.setFontSize(8);
  doc.setTextColor(138, 138, 138);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - 18, curY + 19, { align: 'right' });

  curY += 32;

  // KPI Summary Cards
  const cardW = (pageWidth - 24 - 12) / 3;
  const kpis = [
    { label: 'OVERALL COMPLETION', val: `${insights.ovPct}%`, color: [45, 212, 191] },
    { label: 'TOTAL CHECKS LOGGED', val: `${insights.totalCompletions}`, color: [242, 242, 242] },
    { label: 'BEST ACTIVE STREAK', val: `${insights.bestStreak} Days`, color: [242, 242, 242] }
  ];

  kpis.forEach((kpi, idx) => {
    const x = 12 + idx * (cardW + 6);
    doc.setFillColor(24, 24, 24);
    doc.setDrawColor(38, 38, 38);
    doc.roundedRect(x, curY, cardW, 18, 1.5, 1.5, 'FD');

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.val, x + cardW / 2, curY + 9, { align: 'center' });

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(138, 138, 138);
    doc.text(kpi.label, x + cardW / 2, curY + 14.5, { align: 'center' });
  });

  curY += 23;

  // AI Insights Callout Box
  doc.setFillColor(20, 20, 20);
  doc.setDrawColor(45, 212, 191);
  doc.roundedRect(12, curY, pageWidth - 24, 24, 1.5, 1.5, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(45, 212, 191);
  doc.text('AI CONSISTENCY INSIGHTS & COACHING', 18, curY + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(200, 200, 200);
  const splitText = doc.splitTextToSize(insights.summaryText, pageWidth - 36);
  doc.text(splitText, 18, curY + 12);

  curY += 29;

  // Per-Habit Breakdown Table (AutoTable)
  const breakdownRows = insights.stats.map(h => [
    `${h.icon}  ${h.name}`,
    String(h.goal),
    String(h.actual),
    String(h.left),
    `${h.pct}%`,
    `${h.streak}d`
  ]);

  if (doc.autoTable) {
    doc.autoTable({
      startY: curY,
      margin: { left: 12, right: 12 },
      head: [['Habit Name', 'Goal', 'Actual', 'Left', 'Completion %', 'Streak']],
      body: breakdownRows.length ? breakdownRows : [['No habits tracked', '-', '-', '-', '-', '-']],
      theme: 'plain',
      styles: {
        fontSize: 8,
        textColor: [240, 240, 240],
        fillColor: [17, 17, 17],
        lineColor: [38, 38, 38],
        lineWidth: 0.2,
        cellPadding: 2.2
      },
      headStyles: {
        fillColor: [24, 24, 24],
        textColor: [45, 212, 191],
        fontStyle: 'bold',
        fontSize: 7.5
      },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { halign: 'center' },
        2: { halign: 'center', textColor: [45, 212, 191] },
        3: { halign: 'center' },
        4: { halign: 'center', fontStyle: 'bold' },
        5: { halign: 'center' }
      }
    });

    curY = doc.lastAutoTable.finalY + 8;
  }

  // Monthly Matrix Header
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(242, 242, 242);
  doc.text(`Daily Ledger Grid — ${MONTHS[m]} 1 to ${d2}`, 12, curY);
  curY += 4;

  // Daily Grid Table (Compact)
  const gridHead = ['Habit'];
  for (let d = 1; d <= Math.min(d2, 31); d++) gridHead.push(String(d));
  gridHead.push('Total');

  const gridRows = state.habits.map(h => {
    let tot = 0;
    const r = [`${h.icon} ${h.name}`];
    for (let d = 1; d <= Math.min(d2, 31); d++) {
      const c = isChecked(h.id, dk(y, m, d));
      if (c) tot++;
      r.push(c ? 'v' : '-');
    }
    r.push(String(tot));
    return r;
  });

  if (doc.autoTable) {
    doc.autoTable({
      startY: curY,
      margin: { left: 12, right: 12 },
      head: [gridHead],
      body: gridRows.length ? gridRows : [['No habits', ...Array(d2).fill('-'), '0']],
      theme: 'plain',
      styles: {
        fontSize: 5.5,
        textColor: [200, 200, 200],
        fillColor: [17, 17, 17],
        lineColor: [30, 30, 30],
        lineWidth: 0.15,
        cellPadding: 1,
        halign: 'center'
      },
      headStyles: {
        fillColor: [24, 24, 24],
        textColor: [45, 212, 191],
        fontStyle: 'bold',
        fontSize: 5.5
      },
      columnStyles: {
        0: { cellWidth: 32, halign: 'left', fontStyle: 'bold' }
      }
    });

    curY = doc.lastAutoTable.finalY + 6;
  }

  // Embedded Chart Snapshot (if Donut Canvas exists)
  const donutCanvas = document.getElementById('donut-chart');
  if (donutCanvas && curY < 250) {
    try {
      const imgData = donutCanvas.toDataURL('image/png');
      doc.addImage(imgData, 'PNG', pageWidth - 45, curY, 32, 32);
      doc.setFontSize(7);
      doc.setTextColor(138, 138, 138);
      doc.text('Monthly Chart Snapshot', pageWidth - 45, curY + 36);
    } catch(e) {
      console.warn('Canvas export skipped:', e);
    }
  }

  // Footer Note
  doc.setFontSize(7);
  doc.setTextColor(76, 76, 76);
  doc.text('HABITUS — Professional Monochrome Habit Tracker & Ledger • Self-Hosted & Local Storage', pageWidth / 2, 290, { align: 'center' });

  // Download PDF
  const filename = `Ledger-Report-${MONTHS[m]}-${y}.pdf`;
  doc.save(filename);
}

/* ════════════════════════════════════════════════════════════
   MANAGE HABITS VIEW & DATA BACKUP
═══════════════════════════════════════════════════════════ */
function renderManage() {
  const emojiGrid = document.getElementById('emoji-grid');
  if (emojiGrid) {
    emojiGrid.innerHTML = EMOJIS.map(e =>
      `<button type="button" class="e-btn ${e === selectedEmoji ? 'sel' : ''}" onclick="pickEmoji('${e}')">${e}</button>`
    ).join('');
  }

  const countEl = document.getElementById('h-count');
  if (countEl) countEl.textContent = state.habits.length;

  const el = document.getElementById('manage-list');
  if (!el) return;

  if (!state.habits.length) {
    el.className = '';
    el.innerHTML = '<div class="empty-state">No habits created yet — enter a name above to add your first habit</div>';
    return;
  }

  el.className = 'manage-list';
  el.innerHTML = state.habits.map((h, i) => `
    <div class="m-row" id="mrow-${h.id}">
      <div class="order-col">
        <button type="button" class="ord-btn" onclick="moveHabit(${i},-1)" ${i === 0 ? 'disabled' : ''} aria-label="Move Up">&#9650;</button>
        <button type="button" class="ord-btn" onclick="moveHabit(${i},1)" ${i === state.habits.length - 1 ? 'disabled' : ''} aria-label="Move Down">&#9660;</button>
      </div>
      <span style="font-size:20px">${h.icon}</span>
      <span class="m-name">${esc(h.name)}</span>
      <button type="button" class="btn btn-del" onclick="removeHabit('${h.id}')" aria-label="Delete ${esc(h.name)}">Remove</button>
    </div>`).join('');
}

function pickEmoji(e) {
  selectedEmoji = e;
  document.querySelectorAll('#emoji-grid .e-btn').forEach(b => {
    b.classList.toggle('sel', b.textContent.trim() === e);
  });
}

function addHabit() {
  const inp = document.getElementById('h-name-in');
  if (!inp) return;
  const name = inp.value.trim();
  if (!name) {
    inp.focus();
    inp.style.borderColor = 'var(--danger)';
    return;
  }
  inp.style.borderColor = '';
  const id = 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  state.habits.push({ id: id, name: name, icon: selectedEmoji, createdAt: new Date().toISOString() });
  save();
  inp.value = '';
  renderManage();
  renderToday();
}

function removeHabit(id) {
  const h = state.habits.find(x => x.id === id);
  if (!h) return;

  state.habits = state.habits.filter(x => x.id !== id);
  state.ttBlocks.forEach(b => {
    if (b.habitId === id) b.habitId = null;
  });

  save();
  renderManage();
  renderToday();
}

function moveHabit(idx, dir) {
  const to = idx + dir;
  if (to < 0 || to >= state.habits.length) return;
  const tmp = state.habits[idx];
  state.habits[idx] = state.habits[to];
  state.habits[to] = tmp;
  save();
  renderManage();
  renderToday();
}

/* ── Export & Import JSON Backup & Reset ───────────────────── */
function exportData() {
  const backup = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    habits: state.habits,
    completions: state.completions,
    ttBlocks: state.ttBlocks,
    ttLog: state.ttLog
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `habitus-backup-${todayDk()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data && Array.isArray(data.habits)) {
        state.habits = data.habits || [];
        state.completions = data.completions || {};
        state.ttBlocks = data.ttBlocks || [];
        state.ttLog = data.ttLog || {};
        save();
        alert('Data successfully restored!');
        renderManage();
        renderToday();
        renderGrid();
        renderAnalytics();
        renderTimetable();
      } else {
        alert('Invalid HABITUS backup file format.');
      }
    } catch(err) {
      alert('Error parsing backup file: ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function clearAllData() {
  if (!confirm('Are you sure you want to reset all habits and schedule blocks to a clean state?')) return;
  state.habits = [];
  state.completions = {};
  state.ttBlocks = [];
  state.ttLog = {};
  localStorage.clear();
  localStorage.setItem('hbt_real_data', 'true');
  save();
  renderToday();
  renderManage();
  renderGrid();
  renderAnalytics();
  renderTimetable();
}

/* ════════════════════════════════════════════════════════════
   TIMETABLE VIEW
═══════════════════════════════════════════════════════════ */
function ttBlocksForDate(dateObj) {
  const dow  = dateObj.getDay();
  const dkey = dkFromDate(dateObj);
  return state.ttBlocks.filter(b => {
    if (b.date) return b.date === dkey;               // One-time block
    return b.days && b.days.includes(dow);            // Recurring block
  });
}

function ttBlockStatus(blockId, dateKey) {
  return (state.ttLog[dateKey] && state.ttLog[dateKey][blockId]) || 'pending';
}

function setTTBlockStatus(blockId, dateKey, status) {
  if (!state.ttLog[dateKey]) state.ttLog[dateKey] = {};
  if (status === 'pending') {
    delete state.ttLog[dateKey][blockId];
  } else {
    state.ttLog[dateKey][blockId] = status;
  }

  // Linked habit synchronization
  const block = state.ttBlocks.find(b => b.id === blockId);
  if (block && block.habitId && status === 'done') {
    if (!isChecked(block.habitId, dateKey)) toggle(block.habitId, dateKey);
  }
  save();
}

function renderTimetable() {
  const now = new Date();
  const dkey = dkFromDate(state.ttDate);
  const isToday = (dkFromDate(now) === dkey);
  const dow = state.ttDate.getDay();

  const navLabelEl = document.getElementById('tt-nav-label');
  if (navLabelEl) {
    navLabelEl.textContent = `${DAY_SHORT[dow]}, ${MONTHS[state.ttDate.getMonth()].substring(0,3)} ${state.ttDate.getDate()}`;
  }

  const dayView = document.getElementById('tt-day-view');
  const weekView = document.getElementById('tt-week-view');

  if (state.ttView === 'day') {
    if (dayView) dayView.style.display = '';
    if (weekView) weekView.style.display = 'none';
    renderDayView(state.ttDate, dkey, isToday);
  } else {
    if (dayView) dayView.style.display = 'none';
    if (weekView) weekView.style.display = '';
    renderWeekView(state.ttDate);
  }

  // Live time indicator line
  clearInterval(nowLineInterval);
  if (state.ttView === 'day') {
    updateNowLine(isToday);
    if (isToday) {
      nowLineInterval = setInterval(() => updateNowLine(true), 60000);
    }
  }
}

function renderDayView(dateObj, dkey, isToday) {
  const timeCol   = document.getElementById('sched-time-col');
  const gridLines = document.getElementById('sched-grid-lines');
  const blocksEl  = document.getElementById('sched-blocks');
  if (!timeCol || !gridLines || !blocksEl) return;

  const totalH = `${TT_TOTAL}px`;
  timeCol.style.height   = totalH;
  gridLines.style.height = totalH;
  blocksEl.style.height  = totalH;

  // Render Time Labels
  let tlHtml = '';
  for (let m = TT_START; m <= TT_END; m += 60) {
    const top = topFromMin(m);
    tlHtml += `<div class="sched-time-label" style="top:${top}px">${minToDisplay(m)}</div>`;
  }
  timeCol.innerHTML = tlHtml;

  // Render Grid Lines
  let glHtml = '';
  for (let m = TT_START; m < TT_END; m += 30) {
    const top = topFromMin(m);
    const isHour = (m % 60 === 0);
    glHtml += `<div class="${isHour ? 'sched-hour-line' : 'sched-half-line'}" style="top:${top}px"></div>`;
  }
  gridLines.innerHTML = glHtml;

  // Render Blocks
  const blocks = ttBlocksForDate(dateObj);
  let bHtml = '<div class="time-now-line" id="time-now-line" style="display:none"></div>';

  blocks.forEach(b => {
    const sm = timeToMin(b.startTime);
    const em = timeToMin(b.endTime);
    const top = topFromMin(sm);
    const ht = Math.max(((em - sm) / 30) * TT_SLOT, 24);
    const st = ttBlockStatus(b.id, dkey);
    const doneCls = st === 'done' ? 'done' : (st === 'skipped' ? 'skipped' : '');
    const tlbl = `${minToDisplay(sm)} – ${minToDisplay(em)}`;
    const tall = ht >= 44;

    bHtml += `
      <div class="sched-block ${doneCls}" style="top:${top}px;height:${ht}px" onclick="cycleBlockStatus('${b.id}','${dkey}')" role="button" tabindex="0" aria-label="${esc(b.title)}, ${tlbl}">
        <div class="sb-status-bar"></div>
        <div class="sb-inner">
          <div class="sb-title">${b.icon} ${esc(b.title)}</div>
          ${tall ? `<div class="sb-time-lbl">${tlbl}</div>` : ''}
        </div>
        <div class="sb-actions" onclick="event.stopPropagation()">
          <button type="button" class="sb-action-btn edit-btn" onclick="openBlockModal('${b.id}')" title="Edit Block">&#9998;</button>
          <button type="button" class="sb-action-btn done-btn" onclick="markTTBlock('${b.id}','${dkey}','done')" title="Mark Done">&#10003;</button>
          <button type="button" class="sb-action-btn skip-btn" onclick="markTTBlock('${b.id}','${dkey}','skipped')" title="Mark Skipped">&#8709;</button>
        </div>
      </div>`;
  });

  if (!blocks.length) {
    bHtml += `
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none">
        <div style="font-family:var(--mono);font-size:10px;color:var(--text-3);letter-spacing:2px;text-transform:uppercase">No blocks scheduled for this day</div>
        <div style="font-family:var(--mono);font-size:9px;color:var(--text-3);margin-top:6px">Click "+ Add Block" above to schedule tasks & habits</div>
      </div>`;
  }

  blocksEl.innerHTML = bHtml;
}

function updateNowLine(isToday) {
  const el = document.getElementById('time-now-line');
  if (!el) return;
  if (!isToday) {
    el.style.display = 'none';
    return;
  }
  const now = new Date();
  const m = now.getHours() * 60 + now.getMinutes();
  if (m < TT_START || m > TT_END) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.style.top = `${topFromMin(m)}px`;
  const h12 = now.getHours() % 12 || 12;
  const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
  el.setAttribute('data-time', `${h12}:${String(now.getMinutes()).padStart(2, '0')} ${ampm}`);
}

function cycleBlockStatus(blockId, dkey) {
  const cur = ttBlockStatus(blockId, dkey);
  const next = cur === 'pending' ? 'done' : cur === 'done' ? 'skipped' : 'pending';
  setTTBlockStatus(blockId, dkey, next);
  renderTimetable();
  if (document.getElementById('view-today')?.classList.contains('active')) renderToday();
}

function markTTBlock(blockId, dkey, status) {
  const cur = ttBlockStatus(blockId, dkey);
  setTTBlockStatus(blockId, dkey, cur === status ? 'pending' : status);
  renderTimetable();
  if (document.getElementById('view-today')?.classList.contains('active')) renderToday();
}

/* ── Week View ────────────────────────────────────────────── */
function renderWeekView(dateObj) {
  const wg = document.getElementById('week-grid');
  if (!wg) return;

  const dow = dateObj.getDay();
  const mon = new Date(dateObj);
  mon.setDate(dateObj.getDate() - (dow === 0 ? 6 : dow - 1));
  const todayKey = dkFromDate(new Date());

  const WK_SLOT = 28;
  const WK_TOTAL = ((TT_END - TT_START) / 30) * WK_SLOT;

  let html = `<div class="week-time-col" style="height:${WK_TOTAL + 42}px">`;
  html += '<div style="height:42px;border-bottom:1px solid var(--border)"></div>';
  for (let m = TT_START; m <= TT_END; m += 60) {
    const top = ((m - TT_START) / 30) * WK_SLOT + 42;
    html += `<div class="sched-time-label" style="top:${top}px">${minToDisplay(m)}</div>`;
  }
  html += '</div>';

  for (let di = 0; di < 7; di++) {
    const day = new Date(mon);
    day.setDate(mon.getDate() + di);
    const dkey = dkFromDate(day);
    const isT = (dkey === todayKey);
    const blocks = ttBlocksForDate(day);

    html += `
      <div class="week-day-col ${isT ? 'today-col' : ''}">
        <div class="week-day-hd">
          <div class="week-day-name">${DAY_SHORT[day.getDay()]}</div>
          <div class="week-day-num">${day.getDate()}</div>
        </div>
        <div class="week-day-body" style="position:relative;height:${WK_TOTAL}px">`;

    for (let m2 = TT_START; m2 < TT_END; m2 += 30) {
      const t2 = ((m2 - TT_START) / 30) * WK_SLOT;
      const cls2 = (m2 % 60 === 0) ? 'sched-hour-line' : 'sched-half-line';
      html += `<div class="${cls2}" style="top:${t2}px"></div>`;
    }

    blocks.forEach(b => {
      const sm2 = timeToMin(b.startTime);
      const em2 = timeToMin(b.endTime);
      const top2 = ((sm2 - TT_START) / 30) * WK_SLOT;
      const ht2 = Math.max(((em2 - sm2) / 30) * WK_SLOT, 16);
      const st2 = ttBlockStatus(b.id, dkey);
      const dcls = st2 === 'done' ? 'done' : (st2 === 'skipped' ? 'skipped' : '');
      html += `
        <div class="week-sched-block ${dcls}" style="top:${top2}px;height:${ht2}px" onclick="cycleBlockStatus('${b.id}','${dkey}')" role="button" aria-label="${esc(b.title)}">
          <div class="wsb-inner"><div class="wsb-title">${b.icon} ${esc(b.title)}</div></div>
        </div>`;
    });

    html += '</div></div>';
  }
  wg.innerHTML = html;
}

function setTTView(v) {
  state.ttView = v;
  const dayBtn = document.getElementById('tt-day-btn');
  const weekBtn = document.getElementById('tt-week-btn');
  const dayNav = document.getElementById('tt-day-nav');

  if (dayBtn) {
    dayBtn.classList.toggle('active', v === 'day');
    dayBtn.setAttribute('aria-selected', v === 'day');
  }
  if (weekBtn) {
    weekBtn.classList.toggle('active', v === 'week');
    weekBtn.setAttribute('aria-selected', v === 'week');
  }
  if (dayNav) {
    dayNav.style.display = (v === 'day') ? 'flex' : 'none';
  }

  renderTimetable();
}

function shiftTTDay(d) {
  state.ttDate = new Date(state.ttDate);
  state.ttDate.setDate(state.ttDate.getDate() + d);
  renderTimetable();
}

function jumpTTToday() {
  state.ttDate = new Date();
  renderTimetable();
}

/* ── Block Modal ──────────────────────────────────────────── */
const TT_TIMES = (() => {
  const t = [];
  for (let m = TT_START; m <= TT_END; m += 30) {
    t.push(minToTime(m));
  }
  return t;
})();

function openBlockModal(blockId) {
  editingBlockId = blockId;
  const isEdit = !!blockId;
  const b = isEdit ? state.ttBlocks.find(x => x.id === blockId) : null;
  const root = document.getElementById('modal-root');
  if (!root) return;

  const startVal = b ? b.startTime : '07:00';
  const endVal   = b ? b.endTime   : '08:00';
  ttSelectedEmoji = b ? b.icon : '📅';
  const selDays = b ? (b.days || []) : [1,2,3,4,5];
  const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  const startOpts = TT_TIMES.map(t => `<option value="${t}" ${t === startVal ? 'selected' : ''}>${minToDisplay(timeToMin(t))}</option>`).join('');
  const endOpts   = TT_TIMES.map(t => `<option value="${t}" ${t === endVal ? 'selected' : ''}>${minToDisplay(timeToMin(t))}</option>`).join('');
  const habitOpts = '<option value="">-- None --</option>' +
    state.habits.map(h => `<option value="${h.id}" ${b && b.habitId === h.id ? 'selected' : ''}>${h.icon} ${esc(h.name)}</option>`).join('');
  const emojiBtns = EMOJIS.map(e => `<button type="button" class="e-btn ${e === ttSelectedEmoji ? 'sel' : ''}" onclick="pickTTEmoji('${e}')">${e}</button>`).join('');
  const dayBtns = dayNames.map((d, i) => `<button type="button" class="day-pick-btn ${selDays.includes(i) ? 'sel' : ''}" data-day="${i}" onclick="toggleDayPick(this)">${d}</button>`).join('');

  root.innerHTML = `
    <div class="modal-overlay" onclick="closeModal()"></div>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-card">
        <div class="modal-hd">
          <div class="modal-title" id="modal-title">${isEdit ? 'Edit Schedule Block' : 'Add Schedule Block'}</div>
          <button type="button" class="modal-close" onclick="closeModal()" aria-label="Close modal">&#10005;</button>
        </div>
        <div class="form-col" style="margin-bottom:14px">
          <label class="form-lbl" for="bl-title">Activity Title</label>
          <input class="f-input" id="bl-title" value="${b ? esc(b.title) : ''}" placeholder="e.g. Deep Work, Gym, Reading" maxlength="50" autocomplete="off" />
        </div>
        <div class="form-col" style="margin-bottom:14px">
          <label class="form-lbl">Icon</label>
          <div class="emoji-grid" id="bl-emoji-grid" style="grid-template-columns:repeat(8,1fr);max-height:100px;overflow-y:auto">${emojiBtns}</div>
        </div>
        <div class="modal-time-row">
          <div class="form-col">
            <label class="form-lbl" for="bl-start">Start Time</label>
            <select class="f-input" id="bl-start">${startOpts}</select>
          </div>
          <div class="form-col">
            <label class="form-lbl" for="bl-end">End Time</label>
            <select class="f-input" id="bl-end">${endOpts}</select>
          </div>
        </div>
        <div class="form-col" style="margin-bottom:14px">
          <label class="form-lbl" for="bl-habit">Link to Habit (optional)</label>
          <select class="f-input" id="bl-habit" style="width:100%">${habitOpts}</select>
        </div>
        <div class="form-col" style="margin-bottom:18px">
          <label class="form-lbl">Repeat on days</label>
          <div class="day-picker" id="bl-day-picker">${dayBtns}</div>
          <div style="margin-top:6px;font-family:var(--mono);font-size:9px;color:var(--text-3)">Leave all unselected = one-time block for current day</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          ${isEdit ? '<button type="button" class="btn btn-ghost" id="bl-delete-btn" onclick="deleteBlock()" style="color:var(--danger);border-color:rgba(229,57,53,.4)">Delete</button>' : ''}
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="button" class="btn btn-primary" onclick="saveBlock()">Save Block</button>
        </div>
      </div>
    </div>`;

  setTimeout(() => document.getElementById('bl-title')?.focus(), 60);
}

function closeBlockModal() {
  closeModal();
}

function closeAllModals() {
  closeBlockModal();
  closeExportModal();
  closeIOSModal();
  const overlay = document.getElementById('modal-overlay');
  if (overlay) { overlay.style.display = 'none'; overlay.classList.remove('open'); }
}

function pickTTEmoji(e) {
  ttSelectedEmoji = e;
  document.querySelectorAll('#bl-emoji-grid .e-btn').forEach(b => {
    b.classList.toggle('sel', b.textContent.trim() === e);
  });
}

function toggleDayPick(btn) {
  btn.classList.toggle('sel');
}

function saveBlock() {
  const titleInp = document.getElementById('bl-title');
  if (!titleInp) return;
  const title = titleInp.value.trim();
  if (!title) {
    titleInp.focus();
    titleInp.style.borderColor = 'var(--danger)';
    return;
  }
  titleInp.style.borderColor = '';

  const startT = document.getElementById('bl-start')?.value || '07:00';
  let endT = document.getElementById('bl-end')?.value || '08:00';
  if (timeToMin(endT) <= timeToMin(startT)) {
    endT = minToTime(timeToMin(startT) + 30);
  }

  const habitId = document.getElementById('bl-habit')?.value || null;
  const selDays = [];
  document.querySelectorAll('#bl-day-picker .day-pick-btn.sel').forEach(b => {
    selDays.push(parseInt(b.getAttribute('data-day'), 10));
  });

  if (editingBlockId) {
    const idx = state.ttBlocks.findIndex(b => b.id === editingBlockId);
    if (idx !== -1) {
      state.ttBlocks[idx].title     = title;
      state.ttBlocks[idx].icon      = ttSelectedEmoji;
      state.ttBlocks[idx].startTime = startT;
      state.ttBlocks[idx].endTime   = endT;
      state.ttBlocks[idx].habitId   = habitId || null;
      state.ttBlocks[idx].days      = selDays;
      if (selDays.length === 0) {
        state.ttBlocks[idx].date = dkFromDate(state.ttDate);
      } else {
        delete state.ttBlocks[idx].date;
      }
    }
  } else {
    const block = {
      id: 'tb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      title: title,
      icon: ttSelectedEmoji,
      startTime: startT,
      endTime: endT,
      habitId: habitId || null,
      days: selDays
    };
    if (selDays.length === 0) block.date = dkFromDate(state.ttDate);
    state.ttBlocks.push(block);
  }

  save();
  closeBlockModal();
  renderTimetable();
}

function deleteBlock() {
  if (!editingBlockId) return;
  if (!confirm('Delete this schedule block?')) return;
  state.ttBlocks = state.ttBlocks.filter(b => b.id !== editingBlockId);
  save();
  closeBlockModal();
  renderTimetable();
}

/* ════════════════════════════════════════════════════════════
   PWA & MOBILE INSTALLATION LOGIC
═══════════════════════════════════════════════════════════ */
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768);
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function initPWA() {
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.update();
    }).catch(err => {
      console.warn('SW registration failed:', err);
    });
  }

  // If on mobile device and not yet standalone, show Install App button inside the Stats section
  if (isMobileDevice() && !isStandalone()) {
    const statsBtn = document.getElementById('stats-pwa-btn');
    if (statsBtn) statsBtn.style.display = 'flex';
  }

  // Listen for beforeinstallprompt on Android/Chrome
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPwaPrompt = e;
    const statsBtn = document.getElementById('stats-pwa-btn');
    if (statsBtn) statsBtn.style.display = 'flex';
  });

  window.addEventListener('appinstalled', () => {
    deferredPwaPrompt = null;
    const statsBtn = document.getElementById('stats-pwa-btn');
    if (statsBtn) statsBtn.style.display = 'none';
  });
}

function handlePWAInstallClick() {
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    deferredPwaPrompt.userChoice.then(choice => {
      if (choice.outcome === 'accepted') {
        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.style.display = 'none';
      }
      deferredPwaPrompt = null;
    });
  } else if (isIOS()) {
    openIOSModal();
  } else {
    alert('To install, tap your browser menu (⋮) and select "Install app" or "Add to Home screen".');
  }
}

function dismissPWABanner() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.style.display = 'none';
  sessionStorage.setItem('hbt_pwa_dismissed', 'true');
}

function openIOSModal() {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('ios-install-modal');
  if (overlay) { overlay.style.display = 'block'; overlay.classList.add('open'); }
  if (modal) { modal.style.display = 'flex'; modal.classList.add('open'); }
}

function closeIOSModal() {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('ios-install-modal');
  if (overlay) { overlay.style.display = 'none'; overlay.classList.remove('open'); }
  if (modal) { modal.style.display = 'none'; modal.classList.remove('open'); }
}

/* ════════════════════════════════════════════════════════════
   APP INITIALIZATION
═══════════════════════════════════════════════════════════ */
function init() {
  load();
  initPWA();

  // Set Sidebar Date
  const n = new Date();
  const sbDate = document.getElementById('sb-date');
  if (sbDate) {
    sbDate.textContent = `${MONTHS[n.getMonth()].substring(0,3).toUpperCase()} ${n.getDate()}, ${n.getFullYear()}`;
  }

  // Keyboard Event Listeners
  document.getElementById('h-name-in')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') addHabit();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllModals();
  });

  renderToday();
}

// Kick off when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
