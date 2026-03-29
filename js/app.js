/* ══════════════════════════════════════════════════
   Server Leaderboard — Local Public Eatery Leaside
   ══════════════════════════════════════════════════ */

const FIRST_PLACE_THRESHOLD = 20;
const SECOND_PLACE_THRESHOLD = 15;

// ── HTML sanitization ──────────────────────────────
function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

// ── Storage helpers ────────────────────────────────
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── State ──────────────────────────────────────────
let servers = load('servers', null);
let mentions = load('mentions', []);
let winners = load('winners', []);
let reviewCounts = load('reviewCounts', {});

// Current viewed month (YYYY-MM) — use local date, not UTC
function getLocalYearMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Timezone-safe month arithmetic
function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

let currentMonth = getLocalYearMonth();

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
function getMonthScores(month) {
  const monthMentions = mentions.filter(m => m.month === month);
  const counts = {};
  servers.forEach(s => { counts[s.name] = 0; });
  monthMentions.forEach(m => {
    if (counts[m.server] !== undefined) counts[m.server]++;
  });
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

// Determine current projected winners based on scores (dynamic, not locked in)
// 1st place: highest count among those with >= 25 mentions
// 2nd place: next highest count among those with >= 18 mentions
// Positions can change at any time until month end
function getProjectedWinners(month) {
  const scores = getMonthScores(month);
  let first = null;
  let second = null;

  for (const s of scores) {
    if (!first && s.count >= FIRST_PLACE_THRESHOLD) {
      first = s.name;
    } else if (first && !second && s.count >= SECOND_PLACE_THRESHOLD) {
      second = s.name;
    }
  }

  return { month, first, second };
}

// Check if a month has ended (past month = finalized)
function isMonthFinalized(month) {
  const [y, m] = month.split('-').map(Number);
  // Last moment of the month: last day at 23:59:59
  const endOfMonth = new Date(y, m, 0, 23, 59, 59);
  return new Date() > endOfMonth;
}

// For finalized months, persist winners to history
function finalizeMonth(month) {
  const projected = getProjectedWinners(month);
  if (!projected.first && !projected.second) return projected;

  let w = winners.find(wr => wr.month === month);
  if (!w) {
    w = { month, first: projected.first, second: projected.second };
    winners.push(w);
  } else {
    w.first = projected.first;
    w.second = projected.second;
  }
  save('winners', winners);
  return w;
}

function formatMonthLabel(ym) {
  const [y, m] = ym.split('-');
  const date = new Date(parseInt(y), parseInt(m) - 1);
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function renderLeaderboard() {
  document.getElementById('current-month-label').textContent = formatMonthLabel(currentMonth);

  const scores = getMonthScores(currentMonth);
  const finalized = isMonthFinalized(currentMonth);
  const w = finalized ? finalizeMonth(currentMonth) : getProjectedWinners(currentMonth);
  const tbody = document.getElementById('leaderboard-body');

  // Stats
  const monthReviewCount = reviewCounts[currentMonth] || 0;
  const monthMentions = mentions.filter(m => m.month === currentMonth);
  document.getElementById('total-reviews').textContent = monthReviewCount;
  document.getElementById('total-mentions').textContent = monthMentions.length;
  document.getElementById('active-servers').textContent = servers.length;

  // Prize banner status
  const firstLabel = finalized ? 'Final' : `Qualify with ${FIRST_PLACE_THRESHOLD}+ mentions`;
  const secondLabel = finalized ? 'Final' : `Qualify with ${SECOND_PLACE_THRESHOLD}+ mentions`;

  if (w.first) {
    document.getElementById('first-place-status').textContent =
      (finalized ? 'Winner: ' : 'Leading: ') + w.first;
  } else {
    document.getElementById('first-place-status').textContent = firstLabel;
  }
  if (w.second) {
    document.getElementById('second-place-status').textContent =
      (finalized ? 'Winner: ' : 'Projected: ') + w.second;
  } else {
    document.getElementById('second-place-status').textContent = secondLabel;
  }

  if (scores.length === 0 || scores.every(s => s.count === 0)) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No mentions recorded for this month yet.</td></tr>';
    return;
  }

  tbody.innerHTML = scores
    .filter(s => s.count > 0 || servers.some(sv => sv.name === s.name))
    .map((s, i) => {
      const rank = i + 1;

      // "To 1st" = how many more to reach the 25 threshold
      const gapFirst = FIRST_PLACE_THRESHOLD - s.count;
      const toFirst = gapFirst <= 0 ? 'Qualified' : gapFirst + ' away';

      // "To 2nd" = how many more to reach the 18 threshold
      const gapSecond = SECOND_PLACE_THRESHOLD - s.count;
      const toSecond = gapSecond <= 0 ? 'Qualified' : gapSecond + ' away';

      // Status: projected placement
      let status = '';
      if (finalized && s.name === w.first) {
        status = '<span class="status-won">WON 1st — $100</span>';
      } else if (finalized && s.name === w.second) {
        status = '<span class="status-won">WON 2nd — $50</span>';
      } else if (!finalized && s.name === w.first) {
        status = '<span class="status-hot">Leading 1st</span>';
      } else if (!finalized && s.name === w.second) {
        status = '<span class="status-close">Projected 2nd</span>';
      } else if (s.count >= FIRST_PLACE_THRESHOLD) {
        status = '<span class="status-hot">Qualified</span>';
      } else if (s.count >= SECOND_PLACE_THRESHOLD) {
        status = '<span class="status-close">In contention</span>';
      } else if (s.count >= SECOND_PLACE_THRESHOLD - 3) {
        status = '<span class="status-close">Close</span>';
      }

      const barPct = Math.min(100, (s.count / FIRST_PLACE_THRESHOLD) * 100);

      return `<tr class="rank-${rank <= 3 ? rank : ''}">
        <td>${rank}</td>
        <td>${esc(s.name)}</td>
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

// ── Review Parsing ────────────────────────────────
function findServerMentions(reviews) {
  const allNames = [];
  servers.forEach(s => {
    allNames.push({ canonical: s.name, search: s.name.toLowerCase() });
    (s.aliases || []).forEach(a => {
      allNames.push({ canonical: s.name, search: a.toLowerCase() });
    });
  });

  // Sort longest first so "Jackie G" matches before "Jackie"
  allNames.sort((a, b) => b.search.length - a.search.length);

  reviews.forEach(review => {
    if (review.rating < 4) return;
    let text = review.text.toLowerCase();
    const found = new Set();
    allNames.forEach(({ canonical, search }) => {
      const regex = new RegExp('\\b' + escapeRegex(search) + '\\b', 'i');
      if (regex.test(text)) {
        found.add(canonical);
        // Remove matched text so shorter names don't double-count
        text = text.replace(regex, '');
      }
    });
    review.mentionedServers = Array.from(found);
  });

  return reviews;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Parse button removed — Birdeye flow handles parsing directly

// Confirm button
document.getElementById('confirm-btn').addEventListener('click', () => {
  const reviews = window._parsedReviews || [];
  let added = 0;

  // Track total reviews processed for this month
  const qualifyingCount = reviews.filter(r => r.rating >= 4).length;
  reviewCounts[currentMonth] = (reviewCounts[currentMonth] || 0) + qualifyingCount;
  save('reviewCounts', reviewCounts);

  reviews.forEach(r => {
    if (r.rating < 4) return;
    r.mentionedServers.forEach(server => {
      const snippet = r.text.slice(0, 80);
      const exists = mentions.some(m =>
        m.server === server &&
        m.month === currentMonth &&
        m.reviewSnippet === snippet
      );
      if (!exists) {
        mentions.push({
          server,
          month: currentMonth,
          reviewSnippet: snippet,
          date: new Date().toISOString()
        });
        added++;
      }
    });
  });

  save('mentions', mentions);
  renderLeaderboard();

  alert(added + ' new mention(s) recorded.');

  document.getElementById('parse-results').classList.add('hidden');
  window._parsedReviews = null;
});

// Cancel button
document.getElementById('cancel-btn').addEventListener('click', () => {
  document.getElementById('parse-results').classList.add('hidden');
  window._parsedReviews = null;
});

// ── Server Management ─────────────────────────────
function renderServers() {
  const container = document.getElementById('server-list');
  if (servers.length === 0) {
    container.innerHTML = '<p class="empty-state">No servers added yet.</p>';
    return;
  }

  container.innerHTML = servers.map((s, i) => `
    <div class="server-card">
      <div>
        <div class="name">${esc(s.name)}</div>
        ${s.aliases && s.aliases.length ? '<div class="aliases">Also matches: ' + s.aliases.map(esc).join(', ') + '</div>' : ''}
      </div>
      <button class="btn btn-danger" data-index="${i}">Remove</button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-danger').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      if (confirm('Remove ' + servers[idx].name + '? Their existing mentions will be kept.')) {
        servers.splice(idx, 1);
        save('servers', servers);
        renderServers();
        renderLeaderboard();
      }
    });
  });
}

function addServer() {
  const nameInput = document.getElementById('new-server-name');
  const aliasInput = document.getElementById('new-server-aliases');
  const name = nameInput.value.trim();
  if (!name) return;

  if (servers.some(s => s.name.toLowerCase() === name.toLowerCase())) {
    alert('Server "' + name + '" already exists.');
    return;
  }

  const aliases = aliasInput.value
    .split(',')
    .map(a => a.trim())
    .filter(a => a.length > 0);

  servers.push({ name, aliases });
  save('servers', servers);
  renderServers();
  renderLeaderboard();

  nameInput.value = '';
  aliasInput.value = '';
  nameInput.focus();
}

document.getElementById('add-server-btn').addEventListener('click', addServer);

// Enter key submits add-server form
document.getElementById('new-server-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') addServer();
});
document.getElementById('new-server-aliases').addEventListener('keydown', e => {
  if (e.key === 'Enter') addServer();
});

// ── History ───────────────────────────────────────
function renderHistory() {
  const container = document.getElementById('history-list');

  // Finalize any past months and collect them
  const allMonths = [...new Set(mentions.map(m => m.month))].sort().reverse();
  const pastMonths = allMonths.filter(m => isMonthFinalized(m));

  // Finalize each and collect results
  const results = pastMonths.map(month => {
    const w = finalizeMonth(month);
    const scores = getMonthScores(month);
    return { month, w, scores };
  }).filter(r => r.w.first || r.w.second);

  if (results.length === 0) {
    container.innerHTML = '<p class="empty-state">No winners recorded yet. Winners are determined at the end of each month based on highest mention counts.</p>';
    return;
  }

  container.innerHTML = results.map(({ month, w, scores }) => {
    const topScores = scores.slice(0, 5).map((s, i) =>
      `<div style="margin-left:16px; color: var(--text-muted); font-size:0.85rem;">${i + 1}. ${esc(s.name)} — ${s.count} mentions</div>`
    ).join('');

    return `<div class="history-card">
      <h3>${formatMonthLabel(month)}</h3>
      ${w.first ? '<div class="winner-line"><span class="icon">&#x1f947;</span> <strong>' + esc(w.first) + '</strong> — 1st Place ($100)</div>' : '<div class="winner-line"><span class="icon">&#x1f947;</span> <em>No one qualified for 1st (needed 25+)</em></div>'}
      ${w.second ? '<div class="winner-line"><span class="icon">&#x1f948;</span> <strong>' + esc(w.second) + '</strong> — 2nd Place ($50)</div>' : '<div class="winner-line"><span class="icon">&#x1f948;</span> <em>No one qualified for 2nd (needed 18+)</em></div>'}
      <details style="margin-top:8px"><summary style="cursor:pointer; color: var(--text-muted); font-size:0.85rem;">Full standings</summary>${topScores}</details>
    </div>`;
  }).join('');
}

document.querySelector('[data-tab="history"]').addEventListener('click', renderHistory);

// ── Weekly Update Generator ───────────────────────
document.getElementById('generate-update-btn').addEventListener('click', () => {
  const scores = getMonthScores(currentMonth);
  const w = getProjectedWinners(currentMonth);
  const monthLabel = formatMonthLabel(currentMonth);

  const today = new Date();
  const dayOfMonth = today.getDate();
  const weekNum = Math.ceil(dayOfMonth / 7);

  // Days remaining in month
  const [y, mo] = currentMonth.split('-').map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  const daysLeft = Math.max(0, lastDay - dayOfMonth);

  let text = `Server Leaderboard Update\n`;
  text += `${monthLabel} — Week ${weekNum}\n`;
  text += `${'─'.repeat(36)}\n\n`;

  text += `1st Place ($100): Need 25+ mentions — highest count wins\n`;
  text += `2nd Place ($50): Need 18+ mentions — 2nd highest wins\n`;
  text += `Deadline: End of month (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left!)\n\n`;

  if (w.first) {
    text += `Currently leading 1st: ${w.first}\n`;
  } else {
    text += `No one has qualified for 1st yet (need 25+)\n`;
  }
  if (w.second) {
    text += `Currently projected 2nd: ${w.second}\n`;
  }
  text += '\n';

  text += `Current Standings:\n`;
  text += `${'─'.repeat(36)}\n`;

  scores.forEach((s, i) => {
    const rank = i + 1;
    let line = `${rank}. ${s.name} — ${s.count} mention${s.count !== 1 ? 's' : ''}`;

    if (s.name === w.first) {
      line += '  [Leading 1st]';
    } else if (s.name === w.second) {
      line += '  [Projected 2nd]';
    }

    // Show distance to thresholds
    const parts = [];
    if (s.count < FIRST_PLACE_THRESHOLD) {
      parts.push((FIRST_PLACE_THRESHOLD - s.count) + ' to qualify for 1st');
    }
    if (s.count < SECOND_PLACE_THRESHOLD) {
      parts.push((SECOND_PLACE_THRESHOLD - s.count) + ' to qualify for 2nd');
    }
    if (parts.length && s.name !== w.first && s.name !== w.second) {
      line += '  (' + parts.join(', ') + ')';
    }

    text += line + '\n';
  });

  const totalMentions = scores.reduce((sum, s) => sum + s.count, 0);
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

// ── Data Export/Import ────────────────────────────
function exportData() {
  const data = { servers, mentions, winners, reviewCounts, exportDate: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'leaderboard-backup-' + getLocalYearMonth() + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.servers) { servers = data.servers; save('servers', servers); }
      if (data.mentions) { mentions = data.mentions; save('mentions', mentions); }
      if (data.winners) { winners = data.winners; save('winners', winners); }
      if (data.reviewCounts) { reviewCounts = data.reviewCounts; save('reviewCounts', reviewCounts); }
      renderLeaderboard();
      renderServers();
      alert('Data imported successfully!');
    } catch {
      alert('Invalid backup file.');
    }
  };
  reader.readAsText(file);
}

// Expose for the UI buttons
window.exportData = exportData;
window.importData = importData;

// ── Birdeye Auto-Fetch ────────────────────────────
// Reviews are fetched nightly by GitHub Actions and saved as
// data/reviews-YYYY-MM.json in the repo. This function reads
// that file and converts it into the same format as pasted text.

async function checkBirdeyeSync() {
  try {
    const res = await fetch('data/latest.json?_=' + Date.now());
    if (!res.ok) return;
    const info = await res.json();
    const el = document.getElementById('birdeye-sync-status');
    if (!el) return;
    const ago = timeSince(new Date(info.fetchedAt));
    el.textContent = `Last synced ${ago} — ${info.reviewCount} review${info.reviewCount !== 1 ? 's' : ''}`;
    el.classList.add('synced');
  } catch {
    // data/latest.json doesn't exist yet — silently hide the panel
    const panel = document.getElementById('birdeye-panel');
    if (panel) panel.style.display = 'none';
  }
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



document.getElementById('birdeye-load-btn').addEventListener('click', async () => {
  const btn = document.getElementById('birdeye-load-btn');
  btn.textContent = 'Loading...';
  btn.disabled = true;

  try {
    if (servers.length === 0) {
      alert('Please add server names first in the "Manage Servers" tab.');
      return;
    }

    const res = await fetch(`data/reviews-${currentMonth}.json?_=` + Date.now());
    if (!res.ok) throw new Error(`No data file found for ${currentMonth}`);
    const data = await res.json();

    if (!data.reviews || data.reviews.length === 0) {
      alert('No reviews found for ' + currentMonth + '.\n\nThe nightly job may not have run yet. You can trigger it manually from the GitHub Actions tab.');
      return;
    }

    // Build structured review objects directly from JSON (no text round-trip)
    const reviews = data.reviews.map(r => ({
      reviewer: r.reviewer || 'Unknown',
      rating: r.rating || 0,
      text: r.text || '',
      reviewDate: r.reviewDate ? new Date(r.reviewDate).toLocaleDateString('en-CA') : '',
      mentionedServers: []
    }));

    findServerMentions(reviews);

    // Show results using the same UI as the manual parse flow
    const qualifyingReviews = reviews.filter(r => r.rating >= 4);
    const withMentions = qualifyingReviews.filter(r => r.mentionedServers.length > 0);
    const skippedReviews = reviews.filter(r => r.rating < 4);

    document.getElementById('parse-results').classList.remove('hidden');
    document.getElementById('parse-summary').innerHTML = `
      <strong>${reviews.length}</strong> reviews parsed |
      <strong>${skippedReviews.length}</strong> below 4 stars (skipped) |
      <strong>${qualifyingReviews.length}</strong> qualifying (4-5 stars) |
      <strong>${withMentions.length}</strong> with server mentions
    `;

    const container = document.getElementById('parsed-reviews');
    container.innerHTML = reviews.map(r => {
      const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
      let mentionHtml = '';
      if (r.rating < 4) {
        mentionHtml = '<span class="skipped">Skipped (below 4 stars)</span>';
      } else if (r.mentionedServers.length > 0) {
        mentionHtml = '<span class="mention-found">Mentions: ' + r.mentionedServers.map(esc).join(', ') + '</span>';
      } else {
        mentionHtml = '<span class="no-mention">No server name found</span>';
      }

      const snippet = r.text.length > 120 ? r.text.slice(0, 120) + '...' : r.text;
      const dateStr = r.reviewDate ? r.reviewDate + ' ' : '';
      return `<div class="parsed-review">
        <span class="stars">${stars}</span> — ${esc(r.reviewer)}<br>
        <small>${esc(dateStr + snippet)}</small><br>
        ${mentionHtml}
      </div>`;
    }).join('');

    window._parsedReviews = reviews;

    document.getElementById('parse-results').scrollIntoView({ behavior: 'smooth' });

    const statusEl = document.getElementById('birdeye-sync-status');
    if (statusEl) {
      statusEl.textContent = `Loaded ${data.reviews.length} reviews into the parser`;
    }
  } catch (err) {
    alert('Could not load Birdeye data:\n' + err.message + '\n\nPlease use the manual paste method below, or check that the GitHub Action has run successfully.');
  } finally {
    btn.textContent = "Load This Month's Reviews";
    btn.disabled = false;
  }
});

// ── Initial render ────────────────────────────────
(async () => {
  // Load default server list from repo if localStorage is empty
  if (servers === null) {
    try {
      const res = await fetch('data/servers.json?_=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        servers = data.servers || [];
        save('servers', servers);
      } else {
        servers = [];
      }
    } catch {
      servers = [];
    }
  }
  renderLeaderboard();
  renderServers();
  checkBirdeyeSync();
})();
