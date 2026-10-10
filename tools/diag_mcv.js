const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  await page.goto('http://127.0.0.1:8421');
  await page.waitForTimeout(600);
  await page.click('[data-go="mode"]');
  await page.waitForTimeout(300);
  await page.click('[data-mode="rts"]');
  await page.waitForTimeout(300);
  await page.click('[data-rts-submode="campaign"]');
  await page.waitForTimeout(1000);
  await page.click('#mode-3d-btn');
  await page.waitForTimeout(500);

  const before = await page.evaluate(() => {
    const s = window.__gameState();
    const m = s.rtsUnits.find((u) => u.type === 'mcv');
    window.__handleClick(m.x, m.y);
    return { x: m.x, y: m.y, isDeploying: m.isDeploying };
  });
  console.log('Clicked MCV:', before);

  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(1000);
    const st = await page.evaluate(() => {
      const s = window.__gameState();
      const m = s.rtsUnits.find((u) => u.type === 'mcv');
      return {
        hasMcv: Boolean(m),
        progress: m ? m.deployProgress : null,
        hasHq: s.teams.blue.hasHq,
      };
    });
    console.log('T+' + (i+1) + 's:', st);
  }
  await browser.close();
})();
