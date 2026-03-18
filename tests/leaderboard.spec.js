const { test, expect } = require('@playwright/test');

test.describe('Server Leaderboard', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('page loads with correct branding', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Local Public Eatery');
    await expect(page.locator('.subtitle')).toHaveText('Server Recognition Leaderboard');
    await expect(page.locator('.location-badge')).toHaveText('Leaside');
  });

  test('all 5 tabs are present and clickable', async ({ page }) => {
    await page.goto('/');
    const tabs = page.locator('.tab');
    await expect(tabs).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveClass(/active/);
    }
  });

  test('leaderboard shows empty state initially', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#leaderboard-body')).toContainText('No mentions recorded');
    await expect(page.locator('#total-reviews')).toHaveText('0');
    await expect(page.locator('#total-mentions')).toHaveText('0');
  });

  test('month navigation works', async ({ page }) => {
    await page.goto('/');
    const label = page.locator('#current-month-label');
    const initialMonth = await label.textContent();
    await page.locator('#prev-month').click();
    const prevMonth = await label.textContent();
    expect(prevMonth).not.toBe(initialMonth);
    await page.locator('#next-month').click();
    expect(await label.textContent()).toBe(initialMonth);
  });

  test('can add a server and Enter key works', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-tab="servers"]').click();
    await page.fill('#new-server-name', 'Sarah');
    await page.fill('#new-server-aliases', 'Sara, Sahra');
    await page.locator('#add-server-btn').click();
    await expect(page.locator('.server-card')).toHaveCount(1);
    await expect(page.locator('.server-card .name')).toHaveText('Sarah');

    // Enter key
    await page.fill('#new-server-name', 'Mike');
    await page.press('#new-server-name', 'Enter');
    await expect(page.locator('.server-card')).toHaveCount(2);
  });

  test('prevents duplicate server names', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-tab="servers"]').click();
    await page.fill('#new-server-name', 'Mike');
    await page.locator('#add-server-btn').click();
    page.on('dialog', dialog => dialog.accept());
    await page.fill('#new-server-name', 'Mike');
    await page.locator('#add-server-btn').click();
    await expect(page.locator('.server-card')).toHaveCount(1);
  });

  test('can remove a server with confirmation', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-tab="servers"]').click();
    await page.fill('#new-server-name', 'Alex');
    await page.locator('#add-server-btn').click();
    page.on('dialog', dialog => dialog.accept());
    await page.locator('.btn-danger').click();
    await expect(page.locator('.server-card')).toHaveCount(0);
  });

  test('review parsing requires servers first', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-tab="process"]').click();
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('add server names first');
      await dialog.accept();
    });
    await page.fill('#review-text', 'Test\n5 stars\nGreat food');
    await page.locator('#parse-btn').click();
  });

  test('full workflow: add servers, parse reviews, check leaderboard', async ({ page }) => {
    await page.goto('/');

    // Add servers
    await page.locator('[data-tab="servers"]').click();
    await page.fill('#new-server-name', 'Sarah');
    await page.locator('#add-server-btn').click();
    await page.fill('#new-server-name', 'Mike');
    await page.locator('#add-server-btn').click();

    // Process reviews
    await page.locator('[data-tab="process"]').click();
    const reviewText = [
      'John Smith', '5 stars', '2 weeks ago',
      'Amazing food! Sarah was our server and she was fantastic.',
      'Response from the owner', '2 weeks ago',
      'Thanks John! We will let Sarah know.',
      'Jane Doe', '5 stars', 'a week ago',
      'Great experience. Mike was wonderful and attentive.',
      'Bob Jones', '4 stars', '3 days ago',
      'Good food, Sarah was great as always.',
      'Bad Review', '2 stars', 'yesterday',
      'Terrible service from Sarah.',
    ].join('\n');

    await page.fill('#review-text', reviewText);
    await page.locator('#parse-btn').click();
    await expect(page.locator('#parse-results')).toBeVisible();

    // 2-star review skipped
    await expect(page.locator('.parsed-review .skipped')).toHaveCount(1);

    page.on('dialog', dialog => dialog.accept());
    await page.locator('#confirm-btn').click();

    // Check leaderboard
    await page.locator('[data-tab="leaderboard"]').click();
    const rows = page.locator('#leaderboard-body tr');
    await expect(rows).toHaveCount(2);

    // Sarah: 2 mentions (ranked 1st)
    await expect(rows.nth(0).locator('td').nth(1)).toHaveText('Sarah');
    await expect(rows.nth(0).locator('.mentions-bar span')).toHaveText('2');

    // Mike: 1 mention (ranked 2nd)
    await expect(rows.nth(1).locator('td').nth(1)).toHaveText('Mike');
    await expect(rows.nth(1).locator('.mentions-bar span')).toHaveText('1');
  });

  test('negative reviews are not counted', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-tab="servers"]').click();
    await page.fill('#new-server-name', 'Sarah');
    await page.locator('#add-server-btn').click();

    await page.locator('[data-tab="process"]').click();
    await page.fill('#review-text', 'Angry\n2 stars\nyesterday\nSarah was terrible.');
    await page.locator('#parse-btn').click();
    await expect(page.locator('.parsed-review .skipped')).toHaveCount(1);

    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('0 new mention');
      await dialog.accept();
    });
    await page.locator('#confirm-btn').click();
  });

  test('owner replies are not counted as mentions', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-tab="servers"]').click();
    await page.fill('#new-server-name', 'Sarah');
    await page.locator('#add-server-btn').click();

    await page.locator('[data-tab="process"]').click();
    const reviewText = [
      'Customer', '5 stars', 'a week ago',
      'Great food and atmosphere!',
      'Response from the owner', 'a week ago',
      'Thanks! Sarah will be happy to hear that.',
    ].join('\n');
    await page.fill('#review-text', reviewText);
    await page.locator('#parse-btn').click();
    await expect(page.locator('.parsed-review .no-mention')).toHaveCount(1);
  });

  test('positions are dynamic — not locked in', async ({ page }) => {
    await page.goto('/');

    // Add two servers
    await page.locator('[data-tab="servers"]').click();
    await page.fill('#new-server-name', 'Sarah');
    await page.locator('#add-server-btn').click();
    await page.fill('#new-server-name', 'Mike');
    await page.locator('#add-server-btn').click();

    // Manually inject mentions: Sarah=26, Mike=20
    await page.evaluate(() => {
      const month = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
      const mentions = [];
      for (let i = 0; i < 26; i++) mentions.push({ server: 'Sarah', month, reviewSnippet: 'r' + i, date: new Date().toISOString() });
      for (let i = 0; i < 20; i++) mentions.push({ server: 'Mike', month, reviewSnippet: 'm' + i, date: new Date().toISOString() });
      localStorage.setItem('mentions', JSON.stringify(mentions));
    });
    await page.reload();

    // Sarah should be leading 1st (26 >= 25), Mike projected 2nd (20 >= 18)
    const rows = page.locator('#leaderboard-body tr');
    await expect(rows.nth(0).locator('td').nth(1)).toHaveText('Sarah');
    await expect(rows.nth(0).locator('td').nth(5)).toContainText('Leading 1st');
    await expect(rows.nth(1).locator('td').nth(1)).toHaveText('Mike');
    await expect(rows.nth(1).locator('td').nth(5)).toContainText('Projected 2nd');

    // Now Mike overtakes Sarah: Mike=35, Sarah=26
    await page.evaluate(() => {
      const month = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
      const mentions = [];
      for (let i = 0; i < 26; i++) mentions.push({ server: 'Sarah', month, reviewSnippet: 'r' + i, date: new Date().toISOString() });
      for (let i = 0; i < 35; i++) mentions.push({ server: 'Mike', month, reviewSnippet: 'm' + i, date: new Date().toISOString() });
      localStorage.setItem('mentions', JSON.stringify(mentions));
    });
    await page.reload();

    // Mike should now be leading 1st, Sarah projected 2nd
    await expect(rows.nth(0).locator('td').nth(1)).toHaveText('Mike');
    await expect(rows.nth(0).locator('td').nth(5)).toContainText('Leading 1st');
    await expect(rows.nth(1).locator('td').nth(1)).toHaveText('Sarah');
    await expect(rows.nth(1).locator('td').nth(5)).toContainText('Projected 2nd');
  });

  test('threshold columns show Qualified when met', async ({ page }) => {
    await page.goto('/');

    await page.locator('[data-tab="servers"]').click();
    await page.fill('#new-server-name', 'Sarah');
    await page.locator('#add-server-btn').click();

    // Inject 30 mentions
    await page.evaluate(() => {
      const month = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
      const mentions = [];
      for (let i = 0; i < 30; i++) mentions.push({ server: 'Sarah', month, reviewSnippet: 'r' + i, date: new Date().toISOString() });
      localStorage.setItem('mentions', JSON.stringify(mentions));
    });
    await page.reload();

    const row = page.locator('#leaderboard-body tr').nth(0);
    // "To 1st" should show "Qualified" (30 >= 25)
    await expect(row.locator('td').nth(3)).toHaveText('Qualified');
    // "To 2nd" should also show "Qualified" (30 >= 18)
    await expect(row.locator('td').nth(4)).toHaveText('Qualified');
  });

  test('weekly update shows dynamic standings with days left', async ({ page }) => {
    await page.goto('/');

    await page.locator('[data-tab="servers"]').click();
    await page.fill('#new-server-name', 'Sarah');
    await page.locator('#add-server-btn').click();

    await page.locator('[data-tab="process"]').click();
    await page.fill('#review-text', 'John\n5 stars\n2 days ago\nSarah was great!');
    await page.locator('#parse-btn').click();
    page.on('dialog', dialog => dialog.accept());
    await page.locator('#confirm-btn').click();

    await page.locator('[data-tab="update"]').click();
    await page.locator('#generate-update-btn').click();

    const value = await page.locator('#update-text').inputValue();
    expect(value).toContain('Server Leaderboard Update');
    expect(value).toContain('Sarah');
    expect(value).toContain('day');
    expect(value).toContain('Positions can still change');
  });

  test('export/import buttons are present', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-tab="servers"]').click();
    await expect(page.locator('.data-controls')).toBeVisible();
    await expect(page.locator('text=Export Data')).toBeVisible();
    await expect(page.locator('text=Import Data')).toBeVisible();
  });

  test('prize banner shows correct info', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.prize.first strong')).toContainText('$100');
    await expect(page.locator('.prize.second strong')).toContainText('$50');
    await expect(page.locator('#first-place-status')).toContainText('25');
    await expect(page.locator('#second-place-status')).toContainText('18');
  });

  test('responsive: page renders on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.tabs')).toBeVisible();
    await expect(page.locator('.leaderboard-table')).toBeVisible();
  });

  test('XSS: server names are escaped in output', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-tab="servers"]').click();
    await page.fill('#new-server-name', '<img src=x onerror=alert(1)>');
    await page.locator('#add-server-btn').click();
    const card = page.locator('.server-card .name');
    expect(await card.textContent()).toContain('<img');
    await expect(page.locator('.server-card img')).toHaveCount(0);
  });
});
