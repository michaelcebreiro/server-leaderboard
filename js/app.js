/* ══════════════════════════════════════════════════
   Server Leaderboard — Local Public Eatery Leaside
   ══════════════════════════════════════════════════ */

// ── HTML sanitization ──────────────────────────────
function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

// ── State ──────────────────────────────────────────
const leaderboardCache = {};
let currentMonth = getLocalYearMonth();

function getLocalYearMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function formatMonthLabel(ym) {
  const [y, m] = ym.split('-');
  const date = new Date(parseInt(y), parseInt(m) - 1);
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function timeSince(date) {
  const secs = Math.floor((Date.now() - date) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Data fetching ─────────────────────────────────
async function fetchLeaderboard(month) {
  if (leaderboardCache[month]) return leaderboardCache[month];
  try {
    const res = await fetch(`data/leaderboard-${month}.json?_=` + Date.now());
    if (!res.ok) return null;
    const data = await res.json();
    leaderboardCache[month] = data;
    return data;
  } catch {
    return null;
  }
}

// ── Tab switching ──────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Month navigation ──────────────────────────────
document.getElementById('prev-month').addEventListener('click', () => {
  currentMonth = shiftMonth(currentMonth, -1);
  renderLeaderboard();
});

document.getElementById('next-month').addEventListener('click', () => {
  currentMonth = shiftMonth(currentMonth, 1);
  renderLeaderboard();
});

// ── Date helpers ──────────────────────────────────
function startOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0, 0);
}

function endOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0, 23, 59, 59, 999);
}

function startOfWeek(d) {
  // ISO week: Monday is the first day
  const day = d.getDay(); // 0 (Sun) - 6 (Sat)
  const diff = day === 0 ? 6 : day - 1;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff, 0, 0, 0, 0);
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatShortDate(d) {
  return MONTH_ABBR[d.getMonth()] + ' ' + d.getDate();
}

function formatRangeSubtitle(start, end) {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startStr = formatShortDate(start);
  const endStr = sameMonth ? end.getDate() : formatShortDate(end);
  return `LOCAL Leaside \u00B7 ${startStr}\u2013${endStr}, ${end.getFullYear()}`;
}

function isSameMonth(ym, d) {
  return ym === d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ── Count mentions within a date range ────────────
function countMentionsInRange(data, rangeStart, rangeEnd) {
  const counts = {};
  (data.mentions || []).forEach(group => {
    (group.reviews || []).forEach(r => {
      if (!r.date) return;
      const d = new Date(r.date);
      if (d >= rangeStart && d <= rangeEnd) {
        counts[group.server] = (counts[group.server] || 0) + 1;
      }
    });
  });
  return Object.entries(counts)
    .map(([server, count]) => ({ server, count }))
    .sort((a, b) => b.count - a.count || a.server.localeCompare(b.server));
}

// ── Group servers that share a count onto one row ─
function groupByCount(standings) {
  const groups = [];
  standings.filter(s => s.count > 0).forEach(s => {
    const existing = groups.find(g => g.count === s.count);
    if (existing) existing.servers.push(s.server);
    else groups.push({ count: s.count, servers: [s.server] });
  });
  return groups;
}

// ── Render the shoutouts card ─────────────────────
function renderShoutoutsCard(groups, subtitle, totalMentions) {
  const rowsEl = document.getElementById('shoutouts-rows');
  const subtitleEl = document.getElementById('shoutouts-subtitle');
  const totalEl = document.getElementById('shoutouts-total');

  subtitleEl.textContent = subtitle;
  totalEl.textContent = `${totalMentions} Mention${totalMentions === 1 ? '' : 's'}`;

  if (groups.length === 0) {
    rowsEl.innerHTML = '<div class="empty-state">No mentions recorded yet.</div>';
    return;
  }

  rowsEl.innerHTML = groups.map(g =>
    `<div class="row">
      <span class="num">${g.count}</span>
      <span class="names">${g.servers.map(esc).join(', ')}</span>
    </div>`
  ).join('');
}

// ── Leaderboard rendering ─────────────────────────
async function renderLeaderboard() {
  document.getElementById('current-month-label').textContent = formatMonthLabel(currentMonth);

  const data = await fetchLeaderboard(currentMonth);

  // Determine date range shown on the main card: 1st of month → today (if current month)
  // or → end of month (if past/finalized).
  const now = new Date();
  const monthStart = startOfMonth(currentMonth);
  const rangeEnd = isSameMonth(currentMonth, now) ? now : endOfMonth(currentMonth);

  const subtitle = formatRangeSubtitle(monthStart, rangeEnd);

  if (!data || !data.standings) {
    renderShoutoutsCard([], subtitle, 0);
    document.getElementById('total-reviews').textContent = 0;
    document.getElementById('total-mentions').textContent = '0';
    document.getElementById('active-servers').textContent = 0;
    const t = { first: 20, second: 15 };
    document.getElementById('first-place-status').textContent = `Qualify with ${t.first}+ mentions`;
    document.getElementById('second-place-status').textContent = `Qualify with ${t.second}+ mentions`;
    return;
  }

  const { standings, winners, thresholds, qualifyingReviewCount } = data;
  const totalMentions = standings.reduce((sum, s) => sum + s.count, 0);

  document.getElementById('total-reviews').textContent = qualifyingReviewCount;
  document.getElementById('total-mentions').textContent = totalMentions;
  document.getElementById('active-servers').textContent = standings.filter(s => s.count > 0).length;

  // Prize banner
  const finalized = winners.finalized;
  if (winners.first) {
    document.getElementById('first-place-status').textContent =
      (finalized ? 'Winner: ' : 'Leading: ') + winners.first;
  } else {
    document.getElementById('first-place-status').textContent =
      finalized ? 'Final' : `Qualify with ${thresholds.first}+ mentions`;
  }
  if (winners.second) {
    document.getElementById('second-place-status').textContent =
      (finalized ? 'Winner: ' : 'Projected: ') + winners.second;
  } else {
    document.getElementById('second-place-status').textContent =
      finalized ? 'Final' : `Qualify with ${thresholds.second}+ mentions`;
  }

  // Card (groups with identical counts stacked on one row)
  const groups = groupByCount(standings);
  renderShoutoutsCard(groups, subtitle, totalMentions);
}

// ── PDF Export ───────────────────────────────────
function buildExportHtml(title, subtitle, groups, totalMentions) {
  const rowsHtml = groups.length === 0
    ? '<div class="empty-state">No mentions recorded yet.</div>'
    : groups.map(g =>
        `<div class="row"><span class="num">${g.count}</span><span class="names">${g.servers.map(esc).join(', ')}</span></div>`
      ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #FFF8F0;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    font-family: 'Nunito', sans-serif;
    padding: 20px;
  }
  .card {
    background: #fff;
    border-radius: 20px;
    padding: 22px 24px 18px;
    max-width: 380px;
    width: 100%;
    box-shadow: 6px 6px 0px #111;
    border: 2.5px solid #111;
  }
  .title {
    font-family: 'Fredoka One', cursive;
    font-size: 1.3rem;
    text-align: center;
    color: #111;
    margin-bottom: 4px;
  }
  .subtitle {
    text-align: center;
    font-size: 0.7rem;
    color: #999;
    margin-bottom: 16px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    border-radius: 10px;
    margin-bottom: 5px;
  }
  .row:nth-child(odd)  { background: #FFF3E8; }
  .row:nth-child(even) { background: #F0F6FF; }
  .num {
    font-family: 'Fredoka One', cursive;
    font-size: 1.4rem;
    min-width: 32px;
    text-align: center;
    flex-shrink: 0;
  }
  .row:nth-child(1) .num { color: #FF6B35; }
  .row:nth-child(2) .num { color: #3B82F6; }
  .row:nth-child(3) .num { color: #10B981; }
  .row:nth-child(4) .num { color: #8B5CF6; }
  .row:nth-child(5) .num { color: #F59E0B; }
  .row:nth-child(6) .num { color: #EC4899; }
  .row:nth-child(7) .num { color: #14B8A6; }
  .row:nth-child(n+8) .num { color: #999; }
  .names {
    font-size: 0.78rem;
    font-weight: 600;
    color: #333;
    line-height: 1.4;
  }
  .total {
    margin-top: 14px;
    background: #111;
    border-radius: 12px;
    padding: 10px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .total-label {
    font-family: 'Fredoka One', cursive;
    color: #fff;
    font-size: 0.95rem;
  }
  .total-num {
    font-family: 'Fredoka One', cursive;
    font-size: 1.1rem;
    color: #FF6B35;
  }
  .empty-state {
    text-align: center;
    color: #999;
    font-style: italic;
    padding: 20px 0;
    font-size: 0.85rem;
  }
  @media print {
    body { background: #fff; padding: 0; min-height: auto; }
    .card { box-shadow: none; border: 2.5px solid #111; }
    @page { margin: 14mm; }
  }
</style>
</head>
<body>
<div class="card">
  <div class="title">&#x2B50; ${esc(title)}</div>
  <div class="subtitle">${esc(subtitle)}</div>
  <div class="rows-wrap">${rowsHtml}</div>
  <div class="total">
    <span class="total-label">Total</span>
    <span class="total-num">${totalMentions} Mention${totalMentions === 1 ? '' : 's'}</span>
  </div>
</div>
<script>
  // Wait for web fonts, then auto-open print dialog.
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve())
    .then(function () {
      setTimeout(function () { window.focus(); window.print(); }, 150);
    });
</script>
</body>
</html>`;
}

function openPrintWindow(html) {
  const win = window.open('', '_blank', 'width=500,height=720');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site so the PDF export can open.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

async function exportToPdf(mode) {
  const data = await fetchLeaderboard(currentMonth);
  if (!data) {
    alert('No leaderboard data for ' + formatMonthLabel(currentMonth));
    return;
  }

  const now = new Date();
  const monthStart = startOfMonth(currentMonth);
  // If viewing a past month, clamp "today" to the end of that month.
  const effectiveEnd = isSameMonth(currentMonth, now) ? now : endOfMonth(currentMonth);

  let rangeStart, rangeEnd, subtitle;

  if (mode === 'weekly') {
    const weekStart = startOfWeek(effectiveEnd);
    // Clamp the week start to this month so the numbers always match the card view.
    rangeStart = weekStart < monthStart ? monthStart : weekStart;
  } else {
    rangeStart = monthStart;
  }
  rangeEnd = effectiveEnd;
  subtitle = formatRangeSubtitle(rangeStart, rangeEnd);

  const standings = countMentionsInRange(data, rangeStart, rangeEnd);
  const groups = groupByCount(standings);
  const totalMentions = standings.reduce((sum, s) => sum + s.count, 0);

  const html = buildExportHtml('Partner Shoutouts', subtitle, groups, totalMentions);
  openPrintWindow(html);
}

document.getElementById('export-weekly-btn').addEventListener('click', () => exportToPdf('weekly'));
document.getElementById('export-monthly-btn').addEventListener('click', () => exportToPdf('monthly'));

// ── Sync status ──────────────────────────────────
async function checkSyncStatus() {
  try {
    const res = await fetch('data/index.json?_=' + Date.now());
    if (!res.ok) return;
    const info = await res.json();
    const el = document.getElementById('sync-status');
    if (!el) return;
    const ago = timeSince(new Date(info.lastUpdated));
    el.textContent = `Last updated ${ago}`;
  } catch {
    // No index yet
  }
}

// Manual re-process button
document.getElementById('reprocess-btn').addEventListener('click', async () => {
  const btn = document.getElementById('reprocess-btn');
  btn.textContent = 'Processing...';
  btn.disabled = true;

  try {
    // Fetch servers and reviews client-side, run matching
    const [serversRes, reviewsRes] = await Promise.all([
      fetch('data/servers.json?_=' + Date.now()),
      fetch(`data/reviews-${currentMonth}.json?_=` + Date.now())
    ]);

    if (!serversRes.ok) throw new Error('Could not load server list');
    if (!reviewsRes.ok) throw new Error(`No review data for ${currentMonth}`);

    const servers = (await serversRes.json()).servers || [];
    const reviewData = await reviewsRes.json();

    if (!reviewData.reviews || reviewData.reviews.length === 0) {
      alert('No reviews found for ' + formatMonthLabel(currentMonth));
      return;
    }

    // Run name matching (same algorithm as process-reviews.js)
    const allNames = [];
    servers.forEach(s => {
      allNames.push({ canonical: s.name, search: s.name.toLowerCase() });
      (s.aliases || []).forEach(a => {
        allNames.push({ canonical: s.name, search: a.toLowerCase() });
      });
    });
    allNames.sort((a, b) => b.search.length - a.search.length);

    function escapeRegex(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    const reviews = reviewData.reviews.map(r => ({
      reviewer: r.reviewer || 'Unknown',
      rating: r.rating || 0,
      text: r.text || '',
      reviewDate: r.reviewDate || null,
      mentionedServers: []
    }));

    reviews.forEach(review => {
      if (review.rating < 4) return;
      let text = (review.text || '').toLowerCase();
      const found = new Set();
      allNames.forEach(({ canonical, search }) => {
        const regex = new RegExp('\\b' + escapeRegex(search) + '\\b', 'i');
        if (regex.test(text)) {
          found.add(canonical);
          text = text.replace(regex, '');
        }
      });
      review.mentionedServers = Array.from(found);
    });

    // Show preview results
    const qualifying = reviews.filter(r => r.rating >= 4);
    const withMentions = qualifying.filter(r => r.mentionedServers.length > 0);

    document.getElementById('process-results').classList.remove('hidden');
    document.getElementById('process-summary').innerHTML = `
      <strong>${reviews.length}</strong> reviews |
      <strong>${qualifying.length}</strong> qualifying (4-5 stars) |
      <strong>${withMentions.length}</strong> with server mentions
    `;

    const container = document.getElementById('process-review-list');
    container.innerHTML = qualifying.map(r => {
      const stars = '\u2605'.repeat(r.rating) + '\u2606'.repeat(5 - r.rating);
      let mentionHtml = '';
      if (r.mentionedServers.length > 0) {
        mentionHtml = '<span class="mention-found">Mentions: ' + r.mentionedServers.map(esc).join(', ') + '</span>';
      } else {
        mentionHtml = '<span class="no-mention">No server name found</span>';
      }
      const snippet = r.text.length > 120 ? r.text.slice(0, 120) + '...' : r.text;
      const dateStr = r.reviewDate ? new Date(r.reviewDate).toISOString().slice(0, 10) + ' ' : '';
      return `<div class="parsed-review">
        <span class="stars">${stars}</span> — ${esc(r.reviewer)}<br>
        <small>${esc(dateStr + snippet)}</small><br>
        ${mentionHtml}
      </div>`;
    }).join('');

  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btn.textContent = 'Preview Current Reviews';
    btn.disabled = false;
  }
});

// ── Server management (GitHub-backed editor) ─────
const GH_REPO_OWNER = 'michaelcebreiro';
const GH_REPO_NAME = 'server-leaderboard';
const GH_FILE_PATH = 'data/servers.json';
const GH_TOKEN_KEY = 'gh_token';

const serverState = {
  servers: [],
  removed: [],
  sha: null,
  editingName: null,
  loaded: false
};

function getToken() {
  return localStorage.getItem(GH_TOKEN_KEY) || '';
}

function setToken(token) {
  if (token) localStorage.setItem(GH_TOKEN_KEY, token);
  else localStorage.removeItem(GH_TOKEN_KEY);
}

// UTF-8 safe base64 helpers
function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function base64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

async function ghGetServersFile() {
  const url = `https://api.github.com/repos/${GH_REPO_OWNER}/${GH_REPO_NAME}/contents/${GH_FILE_PATH}?_=${Date.now()}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'token ' + getToken()
    }
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Token rejected by GitHub. Click "Clear token" and re-enter a valid one.');
  }
  if (!res.ok) {
    throw new Error(`GitHub API error (${res.status}): could not load servers.json`);
  }
  const json = await res.json();
  const text = base64ToUtf8(json.content);
  const parsed = JSON.parse(text);
  return {
    sha: json.sha,
    servers: parsed.servers || [],
    removed: parsed.removed || []
  };
}

async function ghPutServersFile(message) {
  const body = {
    servers: serverState.servers,
    removed: serverState.removed
  };
  const content = JSON.stringify(body, null, 2) + '\n';
  const url = `https://api.github.com/repos/${GH_REPO_OWNER}/${GH_REPO_NAME}/contents/${GH_FILE_PATH}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'token ' + getToken(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message,
      content: utf8ToBase64(content),
      sha: serverState.sha
    })
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Token rejected by GitHub. Click "Clear token" and re-enter a valid one.');
  }
  if (res.status === 409 || res.status === 422) {
    throw new Error('CONFLICT');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub API error (${res.status}): ${err.message || 'save failed'}`);
  }
  const json = await res.json();
  serverState.sha = json.content.sha;
}

async function loadServers() {
  if (!getToken()) return;
  const data = await ghGetServersFile();
  serverState.servers = data.servers;
  serverState.removed = data.removed;
  serverState.sha = data.sha;
  serverState.loaded = true;
}

async function saveServers(message) {
  try {
    await ghPutServersFile(message);
  } catch (e) {
    if (e.message === 'CONFLICT') {
      // Refetch latest sha and retry once. The current in-memory edits win.
      const latest = await ghGetServersFile();
      serverState.sha = latest.sha;
      // Merge: keep our servers/removed but use the latest sha so the PUT succeeds.
      await ghPutServersFile(message + ' (auto-merged)');
    } else {
      throw e;
    }
  }
}

function showStatus(msg, kind) {
  const el = document.getElementById('server-status');
  el.textContent = msg;
  el.className = 'server-status ' + (kind || '');
  el.classList.remove('hidden');
  if (kind === 'success') {
    setTimeout(() => el.classList.add('hidden'), 3000);
  }
}

function clearStatus() {
  document.getElementById('server-status').classList.add('hidden');
}

function normalizeName(s) {
  return (s || '').trim();
}

function parseAliasInput(s) {
  return (s || '')
    .split(',')
    .map(a => a.trim())
    .filter(a => a.length > 0);
}

function nameExists(name, exceptIndex) {
  const lower = name.toLowerCase();
  return serverState.servers.some((s, i) =>
    i !== exceptIndex && s.name.toLowerCase() === lower
  );
}

function renderTokenPanel() {
  const panel = document.getElementById('token-panel');
  const editor = document.getElementById('servers-editor');
  if (getToken()) {
    panel.innerHTML = `
      <div class="token-status">
        <span class="token-ok">Access token configured</span>
        <button type="button" class="link-btn" id="clear-token-btn">Clear token</button>
      </div>
    `;
    editor.classList.remove('hidden');
    document.getElementById('clear-token-btn').addEventListener('click', () => {
      if (!confirm('Remove the saved access token from this browser?')) return;
      setToken('');
      serverState.loaded = false;
      serverState.servers = [];
      serverState.sha = null;
      renderTokenPanel();
      renderServerList();
    });
  } else {
    panel.innerHTML = `
      <div class="token-setup">
        <strong>One-time setup</strong>
        <p class="help-text">Paste a GitHub access token to enable editing. Ask Michael for one if you don't have it. The token is saved to this browser only and never sent anywhere except GitHub.</p>
        <form id="token-form" class="add-server-form">
          <input type="password" id="token-input" placeholder="ghp_... or github_pat_..." autocomplete="off" required>
          <button type="submit" class="btn btn-primary">Save Token</button>
        </form>
      </div>
    `;
    editor.classList.add('hidden');
    document.getElementById('token-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = document.getElementById('token-input').value.trim();
      if (!val) return;
      setToken(val);
      try {
        await loadServers();
        renderTokenPanel();
        renderServerList();
      } catch (err) {
        setToken('');
        alert(err.message);
      }
    });
  }
}

function renderServerList() {
  const container = document.getElementById('server-list');
  if (!getToken()) {
    container.innerHTML = '';
    return;
  }
  if (!serverState.loaded) {
    container.innerHTML = '<p class="empty-state">Loading servers...</p>';
    return;
  }
  if (serverState.servers.length === 0) {
    container.innerHTML = '<p class="empty-state">No servers configured yet. Add one above.</p>';
    return;
  }

  container.innerHTML = serverState.servers.map((s, i) => {
    if (serverState.editingName === s.name) {
      return `
        <div class="server-card editing">
          <form class="edit-server-form" data-index="${i}">
            <input type="text" class="edit-name" value="${esc(s.name)}" required>
            <input type="text" class="edit-aliases" value="${esc((s.aliases || []).join(', '))}" placeholder="Aliases (comma-separated)">
            <div class="action-bar">
              <button type="submit" class="btn btn-primary btn-sm">Save</button>
              <button type="button" class="btn btn-secondary btn-sm cancel-edit">Cancel</button>
            </div>
          </form>
        </div>
      `;
    }
    return `
      <div class="server-card" data-index="${i}">
        <div>
          <div class="name">${esc(s.name)}</div>
          ${s.aliases && s.aliases.length ? '<div class="aliases">Also matches: ' + s.aliases.map(esc).join(', ') + '</div>' : ''}
        </div>
        <div class="action-bar">
          <button type="button" class="btn btn-secondary btn-sm edit-btn">Edit</button>
          <button type="button" class="btn btn-danger delete-btn">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  // Wire up buttons
  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.closest('.server-card').dataset.index, 10);
      serverState.editingName = serverState.servers[idx].name;
      renderServerList();
    });
  });

  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = parseInt(e.target.closest('.server-card').dataset.index, 10);
      const server = serverState.servers[idx];
      if (!confirm(`Delete "${server.name}"? They'll be removed from future leaderboard processing. Past months stay unchanged.`)) return;

      const removed = serverState.servers.splice(idx, 1)[0];
      // Add to removed list so auto-discovery doesn't re-add
      if (!serverState.removed.includes(removed.name)) {
        serverState.removed.push(removed.name);
      }
      renderServerList();
      showStatus('Saving...', '');
      try {
        await saveServers(`Remove server: ${removed.name}`);
        showStatus(`Removed "${removed.name}".`, 'success');
      } catch (err) {
        // Roll back on failure
        serverState.servers.splice(idx, 0, removed);
        const rIdx = serverState.removed.indexOf(removed.name);
        if (rIdx !== -1) serverState.removed.splice(rIdx, 1);
        renderServerList();
        showStatus(err.message, 'error');
      }
    });
  });

  container.querySelectorAll('.cancel-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      serverState.editingName = null;
      renderServerList();
    });
  });

  container.querySelectorAll('.edit-server-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const idx = parseInt(form.dataset.index, 10);
      const oldServer = serverState.servers[idx];
      const newName = normalizeName(form.querySelector('.edit-name').value);
      const newAliases = parseAliasInput(form.querySelector('.edit-aliases').value);

      if (!newName) {
        showStatus('Name cannot be empty.', 'error');
        return;
      }
      if (nameExists(newName, idx)) {
        showStatus(`"${newName}" already exists.`, 'error');
        return;
      }

      const oldName = oldServer.name;
      const oldAliases = oldServer.aliases || [];
      serverState.servers[idx] = { name: newName, aliases: newAliases };
      serverState.editingName = null;
      renderServerList();
      showStatus('Saving...', '');
      try {
        const msg = oldName !== newName
          ? `Rename server: ${oldName} -> ${newName}`
          : `Update server: ${newName}`;
        await saveServers(msg);
        showStatus(`Saved "${newName}".`, 'success');
      } catch (err) {
        // Roll back
        serverState.servers[idx] = { name: oldName, aliases: oldAliases };
        renderServerList();
        showStatus(err.message, 'error');
      }
    });
  });
}

document.getElementById('add-server-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('new-server-name');
  const aliasInput = document.getElementById('new-server-aliases');
  const name = normalizeName(nameInput.value);
  const aliases = parseAliasInput(aliasInput.value);

  if (!name) {
    showStatus('Name cannot be empty.', 'error');
    return;
  }
  if (nameExists(name, -1)) {
    showStatus(`"${name}" already exists.`, 'error');
    return;
  }

  const newServer = { name, aliases };
  serverState.servers.push(newServer);
  // If they're adding back a name that was previously removed, take it off the blocklist
  const rIdx = serverState.removed.indexOf(name);
  if (rIdx !== -1) serverState.removed.splice(rIdx, 1);
  nameInput.value = '';
  aliasInput.value = '';
  renderServerList();
  showStatus('Saving...', '');
  try {
    await saveServers(`Add server: ${name}`);
    showStatus(`Added "${name}".`, 'success');
  } catch (err) {
    // Roll back
    const idx = serverState.servers.indexOf(newServer);
    if (idx !== -1) serverState.servers.splice(idx, 1);
    renderServerList();
    showStatus(err.message, 'error');
  }
});

async function initServersTab() {
  renderTokenPanel();
  if (!getToken()) {
    renderServerList();
    return;
  }
  renderServerList();
  try {
    await loadServers();
    renderServerList();
  } catch (err) {
    showStatus(err.message, 'error');
  }
}

// ── History ───────────────────────────────────────
async function renderHistory() {
  const container = document.getElementById('history-list');

  try {
    const res = await fetch('data/index.json?_=' + Date.now());
    if (!res.ok) {
      container.innerHTML = '<p class="empty-state">No history available yet.</p>';
      return;
    }
    const index = await res.json();

    // Fetch all past months (finalized)
    const now = new Date();
    const pastMonths = index.months.filter(m => {
      const [y, mo] = m.split('-').map(Number);
      return now > new Date(y, mo, 0, 23, 59, 59);
    }).reverse();

    if (pastMonths.length === 0) {
      container.innerHTML = '<p class="empty-state">No completed months yet. Winners are determined at the end of each month.</p>';
      return;
    }

    const results = await Promise.all(pastMonths.map(m => fetchLeaderboard(m)));

    container.innerHTML = results
      .filter(d => d && (d.winners.first || d.winners.second))
      .map(d => {
        const topScores = d.standings.slice(0, 5).map((s, i) =>
          `<div style="margin-left:16px; color: var(--text-muted); font-size:0.85rem;">${i + 1}. ${esc(s.server)} — ${s.count} mentions</div>`
        ).join('');

        return `<div class="history-card">
          <h3>${formatMonthLabel(d.month)}</h3>
          ${d.winners.first ? '<div class="winner-line"><span class="icon">&#x1f947;</span> <strong>' + esc(d.winners.first) + '</strong> — 1st Place ($100)</div>' : '<div class="winner-line"><span class="icon">&#x1f947;</span> <em>No one qualified for 1st (needed ' + d.thresholds.first + '+)</em></div>'}
          ${d.winners.second ? '<div class="winner-line"><span class="icon">&#x1f948;</span> <strong>' + esc(d.winners.second) + '</strong> — 2nd Place ($50)</div>' : '<div class="winner-line"><span class="icon">&#x1f948;</span> <em>No one qualified for 2nd (needed ' + d.thresholds.second + '+)</em></div>'}
          <details style="margin-top:8px"><summary style="cursor:pointer; color: var(--text-muted); font-size:0.85rem;">Full standings</summary>${topScores}</details>
        </div>`;
      }).join('') || '<p class="empty-state">No winners recorded yet.</p>';
  } catch {
    container.innerHTML = '<p class="empty-state">Could not load history.</p>';
  }
}

document.querySelector('[data-tab="history"]').addEventListener('click', renderHistory);

// ── Weekly Update Generator ───────────────────────
document.getElementById('generate-update-btn').addEventListener('click', async () => {
  const data = await fetchLeaderboard(currentMonth);
  if (!data) {
    alert('No leaderboard data for ' + formatMonthLabel(currentMonth));
    return;
  }

  const { standings, winners, thresholds } = data;
  const monthLabel = formatMonthLabel(currentMonth);

  const today = new Date();
  const dayOfMonth = today.getDate();
  const weekNum = Math.ceil(dayOfMonth / 7);

  const [y, mo] = currentMonth.split('-').map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  const daysLeft = Math.max(0, lastDay - dayOfMonth);

  let text = `Server Leaderboard Update\n`;
  text += `${monthLabel} — Week ${weekNum}\n`;
  text += `${'─'.repeat(36)}\n\n`;

  text += `1st Place ($100): Need ${thresholds.first}+ mentions — highest count wins\n`;
  text += `2nd Place ($50): Need ${thresholds.second}+ mentions — 2nd highest wins\n`;
  text += `Deadline: End of month (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left!)\n\n`;

  if (winners.first) {
    text += `Currently leading 1st: ${winners.first}\n`;
  } else {
    text += `No one has qualified for 1st yet (need ${thresholds.first}+)\n`;
  }
  if (winners.second) {
    text += `Currently projected 2nd: ${winners.second}\n`;
  }
  text += '\n';

  text += `Current Standings:\n`;
  text += `${'─'.repeat(36)}\n`;

  standings.filter(s => s.count > 0).forEach(s => {
    let line = `${s.rank}. ${s.server} — ${s.count} mention${s.count !== 1 ? 's' : ''}`;

    if (s.server === winners.first) {
      line += '  [Leading 1st]';
    } else if (s.server === winners.second) {
      line += '  [Projected 2nd]';
    }

    const parts = [];
    if (s.count < thresholds.first) {
      parts.push((thresholds.first - s.count) + ' to qualify for 1st');
    }
    if (s.count < thresholds.second) {
      parts.push((thresholds.second - s.count) + ' to qualify for 2nd');
    }
    if (parts.length && s.server !== winners.first && s.server !== winners.second) {
      line += '  (' + parts.join(', ') + ')';
    }

    text += line + '\n';
  });

  const totalMentions = standings.reduce((sum, s) => sum + s.count, 0);
  text += `\nTotal mentions this month: ${totalMentions}\n`;
  text += `\nPositions can still change — keep going, team!\n`;

  document.getElementById('update-output').classList.remove('hidden');
  document.getElementById('update-text').value = text;
});

document.getElementById('copy-update-btn').addEventListener('click', () => {
  const textarea = document.getElementById('update-text');
  textarea.select();
  navigator.clipboard.writeText(textarea.value).then(() => {
    const confirmEl = document.getElementById('copy-confirm');
    confirmEl.classList.remove('hidden');
    setTimeout(() => confirmEl.classList.add('hidden'), 2000);
  });
});

// ── Initial render ────────────────────────────────
renderLeaderboard();
initServersTab();
checkSyncStatus();
