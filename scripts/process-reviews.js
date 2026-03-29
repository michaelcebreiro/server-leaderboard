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

// ── Auto-discovery of new server names ──────────────────────

const NAME_PATTERNS = [
  /\b([A-Z][a-z]{2,})\s+(?:was|is|were)\s+(?:a\s+)?(?:great|amazing|awesome|fantastic|wonderful|lovely|excellent|exceptional|phenomenal|incredible|attentive|friendly|professional|charming|knowledgeable|accommodating|helpful|efficient|pleasant|sweet|personable|the best|new but great|so\s+(?:kind|nice|helpful|friendly|sweet|professional|attentive|lovely|great|fun|good))/gi,
  /(?:our|my|the)\s+(?:server|waitress|waiter|host|hostess|bartender)[,\s]+([A-Z][a-z]{2,})/gi,
  /(?:served by|shoutout to|thanks? to|thank you to|big thank you to)\s+([A-Z][a-z]{2,})/gi,
  /(?:server|waitress|waiter|host|hostess|bartender)\s+([A-Z][a-z]{2,})\b/gi,
  /\b([A-Z][a-z]{2,})\s+(?:made our|gave us|kept our|took care|brought out|checked in|remembered|provided|hosted|killed it|absolutely killed)/gi,
  /\b([A-Z][a-z]{2,})\s+(?:and|&|\+)\s+[A-Z][a-z]{2,}\s+(?:were|was|both|perfect)/gi,
  /(?:and|&|\+)\s+([A-Z][a-z]{2,})\s+(?:were|was|both|perfect|made)/gi,
  /\b([A-Z][a-z]{2,})'s\s+service/gi,
];

const STOP_WORDS = new Set([
  'she','her','his','they','the','our','was','and','are','but','for','had','has','have','who','that','this','not','you','all','can','its',
  'food','place','local','public','service','great','amazing','good','best','really','super','also','would','could','such','much',
  'very','been','came','come','went','made','will','just','even','more','always','definitely','totally','absolutely','everything',
  'someone','something','never','another','their','loved','between','honestly','liked','hopefully','tired','huge','speaking','except',
  'highly','popped','services','fantastic','fabulous','double','burger','whoever','mystery','kudos','shoutout','trivia','york',
  'excellent','attentive','drinks','night','right','well','here','there','where','atmosphere','host','server','waitress','waiter',
  'bartender','during','again','throughout','last','next','first','fast','slow','kids','either','which','every',
  'leaside','toronto','monday','tuesday','wednesday','thursday','friday','saturday','sunday',
  'january','february','march','april','may','june','july','august','september','october','november','december',
  'fish','staff','today','yesterday','care','attention','level','vibe','selection','recommendations',
  'kindness','patience','experience','quality','portion','portions','price','prices','decor','ambiance',
]);

function discoverNewServers(servers) {
  const knownNames = new Set();
  servers.forEach(s => {
    knownNames.add(s.name.toLowerCase());
    (s.aliases || []).forEach(a => knownNames.add(a.toLowerCase()));
  });

  // Scan ALL review files for name patterns
  const reviewFiles = fs.readdirSync(dataDir).filter(f => /^reviews-\d{4}-\d{2}\.json$/.test(f));
  const candidates = {};

  reviewFiles.forEach(file => {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    (raw.reviews || []).forEach(r => {
      if (r.rating < 4 || !r.text) return;
      NAME_PATTERNS.forEach(pat => {
        pat.lastIndex = 0;
        let match;
        while ((match = pat.exec(r.text)) !== null) {
          const name = match[1];
          if (!name || name.length < 3) continue;
          if (STOP_WORDS.has(name.toLowerCase())) continue;
          if (knownNames.has(name.toLowerCase())) continue;
          if (!candidates[name]) candidates[name] = new Set();
          candidates[name].add(r.reviewer || 'unknown');
        }
      });
    });
  });

  // Only auto-add names mentioned by 2+ unique reviewers (high confidence)
  const newServers = Object.entries(candidates)
    .filter(([, reviewers]) => reviewers.size >= 2)
    .map(([name]) => ({ name, aliases: [] }));

  return newServers;
}

// ── Main ────────────────────────────────────────────────────

const serversFile = path.join(dataDir, 'servers.json');
if (!fs.existsSync(serversFile)) {
  console.error('Error: data/servers.json not found.');
  process.exit(1);
}
const serverData = JSON.parse(fs.readFileSync(serversFile, 'utf8'));
let servers = serverData.servers || [];
console.log(`Loaded ${servers.length} servers from data/servers.json`);

// Auto-discover new server names from all reviews
const newServers = discoverNewServers(servers);
if (newServers.length > 0) {
  console.log(`Discovered ${newServers.length} new server(s): ${newServers.map(s => s.name).join(', ')}`);
  servers = servers.concat(newServers);
  serverData.servers = servers;
  fs.writeFileSync(serversFile, JSON.stringify(serverData, null, 2));
  console.log(`Updated data/servers.json (now ${servers.length} servers)`);
} else {
  console.log('No new servers discovered.');
}

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
