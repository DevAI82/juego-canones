const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://127.0.0.1:8421');
  await page.waitForTimeout(600);

  // Navigate menu to RTS Campaña
  await page.click('[data-go="mode"]');
  await page.waitForTimeout(400);
  await page.click('[data-mode="rts"]');
  await page.waitForTimeout(400);
  await page.click('[data-rts-submode="campaign"]');
  await page.waitForTimeout(1000);

  // Take screenshot of Base tab
  await page.screenshot({ path: 'screenshot_sidebar_base.png' });
  console.log('RTS Base tab captured');

  // Click Vehiculos tab
  await page.click('[data-tab="vehicles"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshot_sidebar_vehicles.png' });
  console.log('RTS Vehicles tab captured');

  // Click Soldados tab
  await page.click('[data-tab="infantry"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshot_sidebar_infantry.png' });
  console.log('RTS Infantry tab captured');

  // Click Defensas tab
  await page.click('[data-tab="defenses"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshot_sidebar_defenses.png' });
  console.log('RTS Defenses tab captured');

  await browser.close();
})();
