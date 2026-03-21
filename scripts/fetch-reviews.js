#!/usr/bin/env node
/**
 * Birdeye Review Fetcher
 * Fetches Google reviews for the current month via Birdeye API
 * and writes them to data/reviews-YYYY-MM.json
 *
 * Required environment variables:
 *   BIRDEYE_API_KEY      — API key from Birdeye dashboard
 *   BIRDEYE_BUSINESS_ID  — Business ID from Birdeye dashboard
 *
 * Usage:
 *   node scripts/fetch-reviews.js [YYYY-MM]
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY     = process.env.BIRDEYE_API_KEY;
const BUSINESS_ID = process.env.BIRDEYE_BUSINESS_ID;

if (!API_KEY || !BUSINESS_ID) {
  console.error('Error: BIRDEYE_API_KEY and BIRDEYE_BUSINESS_ID must be set.');
  process.exit(1);
}

// Determine target month (default: current month)
const targetMonth = process.argv[2] || (() => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
})();

const [year, month] = targetMonth.split('-').map(Number);
// Start = first moment of the month (UTC)
const startDate = new Date(year, month - 1, 1, 0, 0, 0).getTime();
// End   = last moment of the month (UTC)
const endDate   = new Date(year, month, 0, 23, 59, 59, 999).getTime();

console.log(`Fetching reviews for ${targetMonth} (${new Date(startDate).toISOString()} → ${new Date(endDate).toISOString()})`);

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const options = { headers };
    https.get(url, options, res => {
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
        } else {
          try { resolve(JSON.parse(raw)); }
          catch (e) { reject(new Error('Invalid JSON: ' + raw.slice(0, 200))); }
        }
      });
    }).on('error', reject);
  });
}

async function fetchAll() {
  const allReviews = [];
  const PAGE_SIZE = 200;
  let sindex = 0;
  let fetchedAll = false;

  while (!fetchedAll) {
    const url = `https://api.birdeye.com/resources/v1/reviews/businessId/${BUSINESS_ID}` +
      `?sindex=${sindex}&count=${PAGE_SIZE}` +
      `&startDate=${startDate}&endDate=${endDate}`;

    console.log(`  Fetching page sindex=${sindex}...`);
    const data = await httpsGet(url, {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    });

    // Handle different response shapes from Birdeye
    const page = Array.isArray(data) ? data
                : Array.isArray(data.reviews) ? data.reviews
                : Array.isArray(data.data) ? data.data
                : [];

    allReviews.push(...page);
    console.log(`  Got ${page.length} reviews (total so far: ${allReviews.length})`);

    if (page.length < PAGE_SIZE) {
      fetchedAll = true;
    } else {
      sindex += PAGE_SIZE;
    }
  }

  return allReviews;
}

// Normalise a raw Birdeye review into the shape the app expects:
// { reviewId, reviewer, rating, text, reviewDate, source }
function normalise(r) {
  const rating = parseInt(r.ratingText ?? r.rating ?? r.starRating ?? 0, 10);
  const reviewer =
    r.reviewerName ?? r.reviewer?.name ?? r.userName ?? r.author ?? 'Unknown';
  const text =
    r.comments ?? r.reviewText ?? r.text ?? r.body ?? '';
  const reviewDate =
    r.reviewDate ?? r.createdDate ?? r.dateAdded ?? r.date ?? null;

  return {
    reviewId:   String(r.reviewId ?? r.id ?? ''),
    reviewer:   String(reviewer).trim(),
    rating,
    text:       String(text).trim(),
    reviewDate: reviewDate ? new Date(typeof reviewDate === 'number' ? reviewDate : reviewDate).toISOString() : null,
    source:     String(r.source ?? r.sourceName ?? '').toUpperCase(),
  };
}

(async () => {
  try {
    const raw = await fetchAll();
    console.log(`\nTotal reviews fetched: ${raw.length}`);

    const reviews = raw.map(normalise).filter(r => r.rating > 0);

    // Sort newest first
    reviews.sort((a, b) => {
      if (!a.reviewDate) return 1;
      if (!b.reviewDate) return -1;
      return new Date(b.reviewDate) - new Date(a.reviewDate);
    });

    const output = {
      month: targetMonth,
      fetchedAt: new Date().toISOString(),
      reviewCount: reviews.length,
      reviews,
    };

    const outDir  = path.join(__dirname, '..', 'data');
    const outFile = path.join(outDir, `reviews-${targetMonth}.json`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(output, null, 2));

    console.log(`\nSaved ${reviews.length} reviews to data/reviews-${targetMonth}.json`);

    // Also write a "latest" pointer so the app knows when it last synced
    const latestFile = path.join(outDir, 'latest.json');
    fs.writeFileSync(latestFile, JSON.stringify({
      month: targetMonth,
      fetchedAt: output.fetchedAt,
      reviewCount: reviews.length,
    }, null, 2));
  } catch (err) {
    console.error('Fetch failed:', err.message);
    process.exit(1);
  }
})();
