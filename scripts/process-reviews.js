#!/usr/bin/env node
/**
 * Review Processor
 * Reads data/servers.json + data/reviews-YYYY-MM.json,
 * matches server names, and outputs data/leaderboard-YYYY-MM.json
 *
 * Usage:
 *   node scripts/process-reviews.js [YYYY-MM | all]
 *   Defaults to current month if no argument given.
 *   Pass "all" to reprocess every reviews-*.json in data/.
 */

const fs = require('fs');
const path = require('path');

const FIRST_PLACE_THRESHOLD = 20;
const SECOND_PLACE_THRESHOLD = 15;

const dataDir = path.join(__dirname, '..', 'data');

// ── Name matching (same algorithm as the frontend) ──────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findServerMentions(reviews, servers) {
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

  return reviews;
}

// ── Processing ──────────────────────────────────────────────

function processMonth(month, servers) {
  const reviewsFile = path.join(dataDir, `reviews-${month}.json`);
  if (!fs.existsSync(reviewsFile)) {
    console.log(`  No reviews file for ${month}, skipping.`);
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(reviewsFile, 'utf8'));
  const reviews = (raw.reviews || []).map(r => ({
    reviewer: r.reviewer || 'Unknown',
    rating: r.rating || 0,
    text: r.text || '',
    reviewDate: r.reviewDate || null,
    mentionedServers: []
  }));

  findServerMentions(reviews, servers);

  // Aggregate mentions per server
  const mentionMap = {};
  servers.forEach(s => { mentionMap[s.name] = { server: s.name, count: 0, reviews: [] }; });

  reviews.forEach(r => {
    if (r.rating < 4) return;
    (r.mentionedServers || []).forEach(name => {
      if (!mentionMap[name]) mentionMap[name] = { server: name, count: 0, reviews: [] };
      mentionMap[name].count++;
      mentionMap[name].reviews.push({
        reviewer: r.reviewer,
        text: r.text,
        date: r.reviewDate ? new Date(r.reviewDate).toISOString().slice(0, 10) : null,
        rating: r.rating
      });
    });
  });

  // Build sorted standings
  const standings = Object.values(mentionMap)
    .sort((a, b) => b.count - a.count || a.server.localeCompare(b.server))
    .map((s, i) => ({
      rank: i + 1,
      server: s.server,
      count: s.count
    }));

  // Determine winners
  const now = new Date();
  const [y, m] = month.split('-').map(Number);
  const monthEnd = new Date(y, m, 0, 23, 59, 59);
  const finalized = now > monthEnd;

  let first = null;
  let second = null;
  const qualified1st = standings.filter(s => s.count >= FIRST_PLACE_THRESHOLD);
  if (qualified1st.length > 0) first = qualified1st[0].server;
  const qualified2nd = standings.filter(s => s.count >= SECOND_PLACE_THRESHOLD && s.server !== first);
  if (qualified2nd.length > 0) second = qualified2nd[0].server;

  const qualifyingReviewCount = reviews.filter(r => r.rating >= 4).length;

  const leaderboard = {
    month,
    processedAt: new Date().toISOString(),
    reviewCount: reviews.length,
    qualifyingReviewCount,
    thresholds: {
      first: FIRST_PLACE_THRESHOLD,
      second: SECOND_PLACE_THRESHOLD
    },
    winners: { finalized, first, second },
    standings,
    mentions: Object.values(mentionMap).filter(m => m.count > 0)
  };

  const outFile = path.join(dataDir, `leaderboard-${month}.json`);
  fs.writeFileSync(outFile, JSON.stringify(leaderboard, null, 2));
  console.log(`  Wrote leaderboard for ${month}: ${qualifyingReviewCount} qualifying reviews, ${standings.filter(s => s.count > 0).length} servers with mentions`);

  return leaderboard;
}

// ── Main ────────────────────────────────────────────────────

const serversFile = path.join(dataDir, 'servers.json');
if (!fs.existsSync(serversFile)) {
  console.error('Error: data/servers.json not found.');
  process.exit(1);
}
const servers = JSON.parse(fs.readFileSync(serversFile, 'utf8')).servers || [];
console.log(`Loaded ${servers.length} servers from data/servers.json`);

const arg = process.argv[2] || (() => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
})();

if (arg === 'all') {
  const files = fs.readdirSync(dataDir).filter(f => /^reviews-\d{4}-\d{2}\.json$/.test(f));
  const months = files.map(f => f.match(/reviews-(\d{4}-\d{2})\.json/)[1]).sort();
  console.log(`Processing all months: ${months.join(', ')}`);
  months.forEach(m => processMonth(m, servers));
} else {
  console.log(`Processing month: ${arg}`);
  processMonth(arg, servers);
}

// Update index.json with available months
const leaderboardFiles = fs.readdirSync(dataDir).filter(f => /^leaderboard-\d{4}-\d{2}\.json$/.test(f));
const availableMonths = leaderboardFiles.map(f => f.match(/leaderboard-(\d{4}-\d{2})\.json/)[1]).sort();
fs.writeFileSync(path.join(dataDir, 'index.json'), JSON.stringify({
  months: availableMonths,
  lastUpdated: new Date().toISOString()
}, null, 2));
console.log(`Updated data/index.json with ${availableMonths.length} months`);
