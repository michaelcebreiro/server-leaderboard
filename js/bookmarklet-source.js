/**
 * Review Grabber Bookmarklet — Source (readable version)
 * This gets minified and URL-encoded into the bookmarklet link.
 *
 * Month-aware: only grabs reviews from the selected month,
 * stops scrolling once it hits reviews from a prior month.
 */
(function () {
  const SCROLL_DELAY = 800;
  const MAX_SCROLLS = 500;

  // ── UI overlay ──────────────────────────────────
  let overlay = document.getElementById('_rgOverlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = '_rgOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99998;background:rgba(0,0,0,0.5);display:flex;align-items:flex-start;justify-content:center;padding-top:60px';

  const panel = document.createElement('div');
  panel.style.cssText = 'background:#1a1d27;color:#e4e6ed;padding:24px;border-radius:12px;font-family:sans-serif;font-size:14px;box-shadow:0 8px 32px rgba(0,0,0,.6);min-width:320px;max-width:400px';
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  function setPanel(html) { panel.innerHTML = html; }
  function closeBtn() {
    return '<button onclick="document.getElementById(\'_rgOverlay\').remove()" style="margin-top:12px;padding:8px 16px;border:none;background:#6c63ff;color:white;border-radius:6px;cursor:pointer;font-size:13px">Close</button>';
  }

  // ── Step 1: Ask which month ─────────────────────
  const now = new Date();
  const months = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    const value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    months.push({ label, value, monthIndex: d.getMonth(), year: d.getFullYear() });
  }

  let optionsHtml = months.map((m, i) =>
    '<button class="_rgMonthBtn" data-idx="' + i + '" style="display:block;width:100%;text-align:left;padding:10px 14px;margin-bottom:6px;border:1px solid #2a2e3a;background:#232734;color:#e4e6ed;border-radius:8px;cursor:pointer;font-size:14px">' + m.label + (i === 0 ? ' (current)' : '') + '</button>'
  ).join('');

  setPanel('<h3 style="margin-bottom:12px">Which month do you want to grab?</h3>' + optionsHtml + closeBtn());

  panel.querySelectorAll('._rgMonthBtn').forEach(btn => {
    btn.addEventListener('click', function () {
      const idx = parseInt(this.dataset.idx);
      startGrab(months[idx]);
    });
  });

  // ── Step 2: Scroll and extract ──────────────────
  async function startGrab(targetMonth) {
    setPanel('<h3>Grabbing reviews for ' + targetMonth.label + '</h3><div id="_rgProgress">Finding reviews panel...</div>');
    const progress = document.getElementById('_rgProgress');

    // Find scrollable reviews container
    const scrollable = document.querySelector('div.m6QErb.DxyBCb.kA9KIf.dS8AEf')
      || document.querySelector('div.m6QErb.DxyBCb.kA9KIf')
      || document.querySelector('div.m6QErb.DxyBCb')
      || document.querySelector('div.m6QErb');

    if (!scrollable) {
      setPanel('<h3>Error</h3><p>Could not find the reviews panel. Make sure you\'re on a Google Maps page with the reviews section open.</p>' + closeBtn());
      return;
    }

    progress.textContent = 'Scrolling to load reviews... 0 found so far';

    // Parse a relative date string into an approximate Date
    function parseRelativeDate(dateStr) {
      const s = dateStr.toLowerCase().trim();
      const now = new Date();

      if (s.includes('just now') || s.includes('moment')) return now;

      const numMatch = s.match(/(\d+)/);
      const num = numMatch ? parseInt(numMatch[1]) : 1;

      if (s.includes('minute')) return new Date(now - num * 60 * 1000);
      if (s.includes('hour')) return new Date(now - num * 3600 * 1000);
      if (s.includes('yesterday')) return new Date(now - 86400 * 1000);
      if (s.includes('day')) return new Date(now - num * 86400 * 1000);
      if (s.includes('week')) return new Date(now - num * 7 * 86400 * 1000);
      if (s.includes('month')) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - num);
        return d;
      }
      if (s.includes('year')) {
        const d = new Date(now);
        d.setFullYear(d.getFullYear() - num);
        return d;
      }

      // Try parsing as absolute date (e.g., "3/15/2026" or "March 15, 2026")
      const parsed = new Date(s);
      if (!isNaN(parsed)) return parsed;

      return null; // Unknown format
    }

    function isInTargetMonth(dateStr) {
      const d = parseRelativeDate(dateStr);
      if (!d) return null; // Unknown — include it to be safe
      return d.getMonth() === targetMonth.monthIndex && d.getFullYear() === targetMonth.year;
    }

    function isPastTargetMonth(dateStr) {
      const d = parseRelativeDate(dateStr);
      if (!d) return false;
      // Review is older than the target month
      const targetStart = new Date(targetMonth.year, targetMonth.monthIndex, 1);
      return d < targetStart;
    }

    // Scroll loop — stop when we hit reviews from before the target month
    let prevHeight = 0;
    let scrollCount = 0;
    let stableCount = 0;
    let pastMonthStreak = 0;

    while (scrollCount < MAX_SCROLLS) {
      scrollable.scrollTop = scrollable.scrollHeight;
      await new Promise(r => setTimeout(r, SCROLL_DELAY));

      const reviewEls = scrollable.querySelectorAll('div.jftiEf');
      progress.textContent = 'Scrolling... ' + reviewEls.length + ' reviews loaded';

      // Check the last few loaded reviews — if they're all before our target month, stop
      if (reviewEls.length > 0) {
        const lastFew = Array.from(reviewEls).slice(-3);
        const allPast = lastFew.every(el => {
          const dateEl = el.querySelector('.rsqaWe');
          return dateEl && isPastTargetMonth(dateEl.textContent);
        });

        if (allPast) {
          pastMonthStreak++;
          if (pastMonthStreak >= 2) {
            progress.textContent = 'Reached reviews from before ' + targetMonth.label + '. Stopping scroll.';
            break;
          }
        } else {
          pastMonthStreak = 0;
        }
      }

      // Also stop if we've hit the bottom (no new content loading)
      if (scrollable.scrollHeight === prevHeight) {
        stableCount++;
        if (stableCount >= 3) break;
      } else {
        stableCount = 0;
      }
      prevHeight = scrollable.scrollHeight;
      scrollCount++;
    }

    // ── Extract reviews ───────────────────────────
    progress.textContent = 'Extracting reviews for ' + targetMonth.label + '...';

    const reviewEls = scrollable.querySelectorAll('div.jftiEf');
    const reviews = [];
    let skippedOtherMonth = 0;

    reviewEls.forEach(el => {
      const nameEl = el.querySelector('.d4r55');
      const starsEl = el.querySelector('.kvMYJc');
      const dateEl = el.querySelector('.rsqaWe');

      // Get the review text but NOT the owner reply
      // The owner reply is typically in a separate container within the review
      const textEl = el.querySelector('.wiI7pd');

      const name = nameEl ? nameEl.textContent.trim() : 'Unknown';
      const starsLabel = starsEl ? starsEl.getAttribute('aria-label') : '';
      const starsMatch = starsLabel.match(/(\d)/);
      const stars = starsMatch ? parseInt(starsMatch[1]) : 0;
      const dateText = dateEl ? dateEl.textContent.trim() : '';
      const text = textEl ? textEl.textContent.trim() : '';

      if (!text) return;

      // Filter by month
      const inMonth = isInTargetMonth(dateText);
      if (inMonth === false) {
        skippedOtherMonth++;
        return;
      }

      // inMonth === null means we couldn't parse the date — include it
      reviews.push({ name, stars, text, date: dateText });
    });

    if (reviews.length === 0) {
      setPanel('<h3>No reviews found</h3><p>No reviews found for ' + targetMonth.label + '.</p><p style="color:#8b8fa3;font-size:13px">' + skippedOtherMonth + ' reviews from other months were skipped.</p>' + closeBtn());
      return;
    }

    // ── Format output ─────────────────────────────
    let output = '';
    reviews.forEach(r => {
      output += r.name + '\n' + r.stars + ' stars\n' + r.date + '\n' + r.text + '\n\n';
    });

    // ── Copy to clipboard ─────────────────────────
    try {
      await navigator.clipboard.writeText(output);
      setPanel(
        '<h3>Done!</h3>' +
        '<p><strong>' + reviews.length + '</strong> reviews from ' + targetMonth.label + ' copied to clipboard.</p>' +
        '<p style="color:#8b8fa3;font-size:13px">' + skippedOtherMonth + ' reviews from other months were skipped.</p>' +
        '<p style="margin-top:12px">Go to the Leaderboard &rarr; <strong>Process Reviews</strong> &rarr; Paste.</p>' +
        closeBtn()
      );
    } catch (e) {
      // Clipboard blocked — show a textarea fallback
      const ta = document.createElement('textarea');
      ta.value = output;
      ta.style.cssText = 'width:100%;height:200px;margin-top:12px;background:#0f1117;color:#e4e6ed;border:1px solid #2a2e3a;border-radius:8px;padding:10px;font-size:12px;font-family:monospace';
      setPanel(
        '<h3>Done!</h3>' +
        '<p><strong>' + reviews.length + '</strong> reviews from ' + targetMonth.label + ' extracted.</p>' +
        '<p style="color:#8b8fa3;font-size:13px">' + skippedOtherMonth + ' reviews from other months were skipped.</p>' +
        '<p style="color:#f1c40f;font-size:13px">Clipboard blocked — select all text below and copy manually.</p>' +
        closeBtn()
      );
      panel.appendChild(ta);
      ta.select();
    }
  }
})();
