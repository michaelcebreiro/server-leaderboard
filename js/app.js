/* ══════════════════════════════════════════════════
   Server Leaderboard — Local Public Eatery Leaside
   ══════════════════════════════════════════════════ */

const FIRST_PLACE_THRESHOLD = 25;
const SECOND_PLACE_THRESHOLD = 18;

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
let servers = load('servers', []);
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

function getMonthWinners(month) {
  return winners.find(w => w.month === month) || { month, first: null, second: null };
}

function checkAndRecordWinners(month) {
  const scores = getMonthScores(month);
  let w = winners.find(wr => wr.month === month);
  if (!w) {
    w = { month, first: null, second: null };
    winners.push(w);
  }

  for (const s of scores) {
    if (!w.first && s.count >= FIRST_PLACE_THRESHOLD) {
      w.first = s.name;
    }
    if (w.first && !w.second && s.name !== w.first && s.count >= SECOND_PLACE_THRESHOLD) {
      w.second = s.name;
    }
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
  const w = checkAndRecordWinners(currentMonth);
  const tbody = document.getElementById('leaderboard-body');

  // Stats
  const monthReviewCount = reviewCounts[currentMonth] || 0;
  const monthMentions = mentions.filter(m => m.month === currentMonth);
  document.getElementById('total-reviews').textContent = monthReviewCount;
  document.getElementById('total-mentions').textContent = monthMentions.length;
  document.getElementById('active-servers').textContent = servers.length;

  // Prize status
  if (w.first) {
    document.getElementById('first-place-status').textContent = esc(w.first) + ' won 1st!';
  } else {
    document.getElementById('first-place-status').textContent = '25 mentions to win';
  }
  if (w.second) {
    document.getElementById('second-place-status').textContent = esc(w.second) + ' won 2nd!';
  } else {
    document.getElementById('second-place-status').textContent = '18 mentions to win';
  }

  if (scores.length === 0 || scores.every(s => s.count === 0)) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No mentions recorded for this month yet.</td></tr>';
    return;
  }

  tbody.innerHTML = scores
    .filter(s => s.count > 0 || servers.some(sv => sv.name === s.name))
    .map((s, i) => {
      const rank = i + 1;
      const toFirst = w.first ? (s.name === w.first ? '—' : 'Closed') : Math.max(0, FIRST_PLACE_THRESHOLD - s.count);
      const toSecond = w.second ? (s.name === w.second ? '—' : (s.name === w.first ? '—' : 'Closed')) : Math.max(0, SECOND_PLACE_THRESHOLD - s.count);

      let status = '';
      if (s.name === w.first) status = '<span class="status-won">WON 1st</span>';
      else if (s.name === w.second) status = '<span class="status-won">WON 2nd</span>';
      else if (s.count >= FIRST_PLACE_THRESHOLD - 3 && !w.first) status = '<span class="status-hot">Close to 1st</span>';
      else if (s.count >= SECOND_PLACE_THRESHOLD - 3 && !w.second) status = '<span class="status-close">Close to 2nd</span>';

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
        <td>${typeof toFirst === 'number' ? toFirst + ' away' : toFirst}</td>
        <td>${typeof toSecond === 'number' ? toSecond + ' away' : toSecond}</td>
        <td>${status}</td>
      </tr>`;
    }).join('');
}

// ── Review Parsing ────────────────────────────────
function parseReviewText(rawText) {
  const results = [];
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let i = 0;
  while (i < lines.length) {
    const starMatch = lines[i].match(/^(\d)\s*star/i)
      || lines[i].match(/(\d)\s*(?:star|estrella)/i)
      || lines[i].match(/^([1-5])\/5/);

    const unicodeStarMatch = lines[i].match(/^([★⭐]{1,5})$/);

    let rating = null;
    if (starMatch) {
      rating = parseInt(starMatch[1]);
    } else if (unicodeStarMatch) {
      rating = unicodeStarMatch[1].length;
    }

    if (rating !== null) {
      const reviewerName = i > 0 ? lines[i - 1] : 'Unknown';
      let reviewText = '';
      let j = i + 1;

      // Skip the "time ago" line
      if (j < lines.length && /^\d+|^a\s/i.test(lines[j]) && /ago$/i.test(lines[j])) {
        j++;
      }

      while (j < lines.length) {
        if (/^(response from|reply from|respuesta de)/i.test(lines[j])) {
          j++;
          if (j < lines.length && /ago$/i.test(lines[j])) j++;
          while (j < lines.length) {
            if (j + 1 < lines.length) {
              const nextStarMatch = lines[j + 1].match(/^(\d)\s*star/i)
                || lines[j + 1].match(/^([★⭐]{1,5})$/);
              if (nextStarMatch) break;
            }
            j++;
          }
          break;
        }

        if (j + 1 < lines.length) {
          const nextStarMatch = lines[j + 1].match(/^(\d)\s*star/i)
            || lines[j + 1].match(/(\d)\s*(?:star|estrella)/i)
            || lines[j + 1].match(/^([★⭐]{1,5})$/);
          if (nextStarMatch) break;
        }

        reviewText += lines[j] + ' ';
        j++;
      }

      results.push({
        reviewer: reviewerName,
        rating,
        text: reviewText.trim(),
        mentionedServers: []
      });

      i = j;
    } else {
      i++;
    }
  }

  return results;
}

function findServerMentions(reviews) {
  const allNames = [];
  servers.forEach(s => {
    allNames.push({ canonical: s.name, search: s.name.toLowerCase() });
    (s.aliases || []).forEach(a => {
      allNames.push({ canonical: s.name, search: a.toLowerCase() });
    });
  });

  reviews.forEach(review => {
    if (review.rating < 4) return;
    const text = review.text.toLowerCase();
    const found = new Set();
    allNames.forEach(({ canonical, search }) => {
      const regex = new RegExp('\\b' + escapeRegex(search) + '\\b', 'i');
      if (regex.test(text)) found.add(canonical);
    });
    review.mentionedServers = Array.from(found);
  });

  return reviews;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Parse button
document.getElementById('parse-btn').addEventListener('click', () => {
  const raw = document.getElementById('review-text').value;
  if (!raw.trim()) return;

  if (servers.length === 0) {
    alert('Please add server names first in the "Manage Servers" tab.');
    return;
  }

  let reviews = parseReviewText(raw);
  reviews = findServerMentions(reviews);

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
    return `<div class="parsed-review">
      <span class="stars">${stars}</span> — ${esc(r.reviewer)}<br>
      <small>${esc(snippet)}</small><br>
      ${mentionHtml}
    </div>`;
  }).join('');

  window._parsedReviews = reviews;
});

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
  checkAndRecordWinners(currentMonth);
  renderLeaderboard();

  alert(added + ' new mention(s) recorded.');

  document.getElementById('parse-results').classList.add('hidden');
  document.getElementById('review-text').value = '';
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
  const pastWinners = winners
    .filter(w => w.first || w.second)
    .sort((a, b) => b.month.localeCompare(a.month));

  if (pastWinners.length === 0) {
    container.innerHTML = '<p class="empty-state">No winners recorded yet. Winners will appear here once someone reaches the thresholds.</p>';
    return;
  }

  container.innerHTML = pastWinners.map(w => {
    const scores = getMonthScores(w.month);
    const topScores = scores.slice(0, 5).map((s, i) =>
      `<div style="margin-left:16px; color: var(--text-muted); font-size:0.85rem;">${i + 1}. ${esc(s.name)} — ${s.count} mentions</div>`
    ).join('');

    return `<div class="history-card">
      <h3>${formatMonthLabel(w.month)}</h3>
      ${w.first ? '<div class="winner-line"><span class="icon">&#x1f947;</span> <strong>' + esc(w.first) + '</strong> — 1st Place ($100)</div>' : '<div class="winner-line"><span class="icon">&#x1f947;</span> <em>No 1st place winner</em></div>'}
      ${w.second ? '<div class="winner-line"><span class="icon">&#x1f948;</span> <strong>' + esc(w.second) + '</strong> — 2nd Place</div>' : '<div class="winner-line"><span class="icon">&#x1f948;</span> <em>No 2nd place winner</em></div>'}
      <details style="margin-top:8px"><summary style="cursor:pointer; color: var(--text-muted); font-size:0.85rem;">Full standings</summary>${topScores}</details>
    </div>`;
  }).join('');
}

document.querySelector('[data-tab="history"]').addEventListener('click', renderHistory);

// ── Weekly Update Generator ───────────────────────
document.getElementById('generate-update-btn').addEventListener('click', () => {
  const scores = getMonthScores(currentMonth);
  const w = getMonthWinners(currentMonth);
  const monthLabel = formatMonthLabel(currentMonth);

  const today = new Date();
  const dayOfMonth = today.getDate();
  const weekNum = Math.ceil(dayOfMonth / 7);

  let text = `Server Leaderboard Update\n`;
  text += `${monthLabel} — Week ${weekNum}\n`;
  text += `${'─'.repeat(36)}\n\n`;

  text += `1st Place ($100 Bonus): ${FIRST_PLACE_THRESHOLD} mentions\n`;
  text += `2nd Place: ${SECOND_PLACE_THRESHOLD} mentions\n\n`;

  if (w.first) {
    text += `1st Place has been WON by ${w.first}!\n`;
  }
  if (w.second) {
    text += `2nd Place has been WON by ${w.second}!\n`;
  }
  text += '\n';

  text += `Current Standings:\n`;
  text += `${'─'.repeat(36)}\n`;

  scores.forEach((s, i) => {
    const rank = i + 1;
    let line = `${rank}. ${s.name} — ${s.count} mention${s.count !== 1 ? 's' : ''}`;

    if (s.name === w.first) {
      line += '  [WON 1st]';
    } else if (s.name === w.second) {
      line += '  [WON 2nd]';
    } else {
      const parts = [];
      if (!w.first) {
        const gap = FIRST_PLACE_THRESHOLD - s.count;
        parts.push(gap + ' away from 1st');
      }
      if (!w.second) {
        const gap = SECOND_PLACE_THRESHOLD - s.count;
        parts.push(gap + ' away from 2nd');
      }
      if (parts.length) line += '  (' + parts.join(', ') + ')';
    }

    text += line + '\n';
  });

  const totalMentions = scores.reduce((sum, s) => sum + s.count, 0);
  text += `\nTotal mentions this month: ${totalMentions}\n`;
  text += `\nKeep up the great work, team!\n`;

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

// ── Initial render ────────────────────────────────
renderLeaderboard();
renderServers();
