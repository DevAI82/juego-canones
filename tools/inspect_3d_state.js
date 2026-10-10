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

  // Take screenshot in 2D before deploy
  await page.screenshot({ path: 'scratch_inspect/screen_2d_start.png' });

  // Toggle 3D
  await page.click('#mode-3d-btn');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'scratch_inspect/screen_3d_start.png' });

  // Get DOM elements info
  const info = await page.evaluate(() => {
    const cvs2d = document.getElementById('game-canvas');
    const cvs3d = document.getElementById('rts-webgl-canvas');
    const container = document.getElementById('game-container');
    const viewport = document.getElementById('game-viewport');
    return {
      cvs2d: cvs2d ? {
        zIndex: window.getComputedStyle(cvs2d).zIndex,
        pointerEvents: window.getComputedStyle(cvs2d).pointerEvents,
        background: cvs2d.style.background,
        rect: cvs2d.getBoundingClientRect(),
      } : null,
      cvs3d: cvs3d ? {
        zIndex: window.getComputedStyle(cvs3d).zIndex,
        pointerEvents: window.getComputedStyle(cvs3d).pointerEvents,
        rect: cvs3d.getBoundingClientRect(),
        display: cvs3d.style.display,
      } : null,
      container: container ? {
        zIndex: window.getComputedStyle(container).zIndex,
        transform: container.style.transform,
        rect: container.getBoundingClientRect(),
      } : null,
      viewport: viewport ? {
        rect: viewport.getBoundingClientRect(),
      } : null,
    };
  });
  console.log('DOM info in 3D:', JSON.stringify(info, null, 2));

  await browser.close();
})();
