const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  if (!fs.existsSync('scratch_inspect')) fs.mkdirSync('scratch_inspect', { recursive: true });

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

  // Deploy MCV
  await page.evaluate(() => {
    const s = window.__gameState();
    const mcv = s.rtsUnits.find((u) => u.team === "blue" && u.type === "mcv");
    if (mcv) window.__handleClick(mcv.x, mcv.y);
  });
  await page.waitForTimeout(3800);

  // Build solar and refinery
  await page.click('[data-build-key="solar"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__handleClick(380, 1520));
  await page.waitForTimeout(4200);

  await page.click('[data-build-key="refinery"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__handleClick(480, 1520));
  await page.waitForTimeout(5200);

  // Take 2D screenshot of base
  await page.screenshot({ path: 'scratch_inspect/base_2d.png' });

  // Toggle 3D
  await page.click('#mode-3d-btn');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'scratch_inspect/base_3d_current.png' });

  console.log('Base screenshots taken');
  await browser.close();
})();
