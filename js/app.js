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

// ── Leaderboard rendering ─────────────────────────
async function renderLeaderboard() {
  document.getElementById('current-month-label').textContent = formatMonthLabel(currentMonth);

  const data = await fetchLeaderboard(currentMonth);
  const tbody = document.getElementById('leaderboard-body');

  if (!data || !data.standings || data.standings.every(s => s.count === 0)) {
    document.getElementById('total-reviews').textContent = data ? data.reviewCount : 0;
    document.getElementById('total-mentions').textContent = '0';
    document.getElementById('active-servers').textContent = data ? data.standings.length : 0;

    const t = data ? data.thresholds : { first: 20, second: 15 };
    document.getElementById('first-place-status').textContent = `Qualify with ${t.first}+ mentions`;
    document.getElementById('second-place-status').textContent = `Qualify with ${t.second}+ mentions`;

    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No mentions recorded for this month yet.</td></tr>';
    return;
  }

  const { standings, winners, thresholds, reviewCount, qualifyingReviewCount } = data;
  const totalMentions = standings.reduce((sum, s) => sum + s.count, 0);

  document.getElementById('total-reviews').textContent = qualifyingReviewCount;
  document.getElementById('total-mentions').textContent = totalMentions;
  document.getElementById('active-servers').textContent = standings.length;

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

  // Table
  tbody.innerHTML = standings
    .filter(s => s.count > 0)
    .map(s => {
      const gapFirst = thresholds.first - s.count;
      const toFirst = gapFirst <= 0 ? 'Qualified' : gapFirst + ' away';
      const gapSecond = thresholds.second - s.count;
      const toSecond = gapSecond <= 0 ? 'Qualified' : gapSecond + ' away';

      let status = '';
      if (finalized && s.server === winners.first) {
        status = '<span class="status-won">WON 1st — $100</span>';
      } else if (finalized && s.server === winners.second) {
        status = '<span class="status-won">WON 2nd — $50</span>';
      } else if (!finalized && s.server === winners.first) {
        status = '<span class="status-hot">Leading 1st</span>';
      } else if (!finalized && s.server === winners.second) {
        status = '<span class="status-close">Projected 2nd</span>';
      } else if (s.count >= thresholds.first) {
        status = '<span class="status-hot">Qualified</span>';
      } else if (s.count >= thresholds.second) {
        status = '<span class="status-close">In contention</span>';
      } else if (s.count >= thresholds.second - 3) {
        status = '<span class="status-close">Close</span>';
      }

      const barPct = Math.min(100, (s.count / thresholds.first) * 100);

      return `<tr class="rank-${s.rank <= 3 ? s.rank : ''}">
        <td>${s.rank}</td>
        <td>${esc(s.server)}</td>
        <td>
          <div class="mentions-bar">
            <span>${s.count}</span>
            <div class="bar" style="width:${barPct}%"></div>
          </div>
        </td>
        <td>${toFirst}</td>
        <td>${toSecond}</td>
        <td>${status}</td>
      </tr>`;
    }).join('');
}

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
