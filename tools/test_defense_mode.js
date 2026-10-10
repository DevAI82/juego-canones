const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('404')) errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('http://127.0.0.1:8421');
  await page.waitForTimeout(600);

  // 1. Test Tower Defense Level 1
  console.log('Testing Tower Defense Level 1...');
  await page.click('[data-go="mode"]');
  await page.waitForTimeout(300);
  await page.click('[data-mode="defense"]');
  await page.waitForTimeout(300);
  await page.click('.start-level-btn[data-level="1"]');
  await page.waitForTimeout(1000);

  // Check build menu is visible and clickable
  const buildMenuVis = await page.evaluate(() => {
    const el = document.getElementById('build-menu');
    return el && !el.classList.contains('hidden');
  });
  console.log('Build menu visible in Defense mode:', buildMenuVis);

  // Click tower card
  await page.click('.tower-card[data-type="gun"]');
  await page.waitForTimeout(400);

  // Place tower
  await page.evaluate(() => window.__handleClick(260, 240));
  await page.waitForTimeout(500);

  const towerPlaced = await page.evaluate(() => window.__gameState().towers.length > 0);
  console.log('Tower placed successfully:', towerPlaced);

  await browser.close();
  if (errors.length > 0) {
    console.error('Errors:', errors);
    process.exit(1);
  }
  console.log('✔ Tower Defense mode verified without errors!');
})();
