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

// ── Server list display ──────────────────────────
async function renderServers() {
  try {
    const res = await fetch('data/servers.json?_=' + Date.now());
    if (!res.ok) return;
    const data = await res.json();
    const servers = data.servers || [];

    const container = document.getElementById('server-list');
    if (servers.length === 0) {
      container.innerHTML = '<p class="empty-state">No servers configured yet.</p>';
      return;
    }

    container.innerHTML = servers.map(s => `
      <div class="server-card">
        <div>
          <div class="name">${esc(s.name)}</div>
          ${s.aliases && s.aliases.length ? '<div class="aliases">Also matches: ' + s.aliases.map(esc).join(', ') + '</div>' : ''}
        </div>
      </div>
    `).join('');
  } catch {
    // Silently fail
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
renderServers();
checkSyncStatus();
