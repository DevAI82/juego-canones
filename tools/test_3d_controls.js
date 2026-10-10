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

  // Switch to 3D mode
  await page.click('#mode-3d-btn');
  await page.waitForTimeout(500);

  // Apply pointer-events: none to webgl canvas
  await page.evaluate(() => {
    const cvs = document.getElementById('rts-webgl-canvas');
    if (cvs) cvs.style.pointerEvents = 'none';
  });

  const before3D = await page.evaluate(() => ({
    cam: window.__camera ? { ...window.__camera() } : null,
    zoom: window.__zoom ? window.__zoom() : null,
  }));
  console.log('Before in 3D (with pointer-events: none):', before3D);

  // Try mouse wheel on map in 3D
  await page.mouse.move(500, 400);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(300);

  const afterWheel3D = await page.evaluate(() => ({
    cam: window.__camera ? { ...window.__camera() } : null,
    zoom: window.__zoom ? window.__zoom() : null,
  }));
  console.log('After wheel in 3D:', afterWheel3D);

  // Try drag in 3D
  await page.mouse.move(500, 400);
  await page.mouse.down();
  await page.mouse.move(300, 200, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const afterDrag3D = await page.evaluate(() => ({
    cam: window.__camera ? { ...window.__camera() } : null,
    zoom: window.__zoom ? window.__zoom() : null,
  }));
  console.log('After drag in 3D:', afterDrag3D);

  await browser.close();
})();
