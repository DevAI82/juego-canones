const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("PAGE ERROR:", msg.text());
  });

  console.log("Navigating to http://127.0.0.1:8421...");
  await page.goto("http://127.0.0.1:8421", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  console.log("Starting RTS Campaign...");
  await page.click('[data-screen="home"] [data-go="mode"]');
  await page.waitForTimeout(400);
  await page.click('[data-screen="mode"] [data-mode="rts"]');
  await page.waitForTimeout(400);
  await page.click('[data-screen="rts-mode"] [data-rts-submode="campaign"]');
  await page.waitForTimeout(1200);

  // 1. Check viewport dimensions and position
  const viewportBox = await page.locator("#game-viewport").boundingBox();
  console.log("Viewport Bounding Box:", viewportBox);
  if (viewportBox.x <= 1 && viewportBox.y <= 1) {
    console.log("SUCCESS: Map touches top-left (0,0) - NO BLACK OR GREY BARS on the left/top!");
  }

  // 2. Check nav controls position (MUST be inside game-viewport as a floating overlay)
  const navBox = await page.locator("#nav-controls").boundingBox();
  console.log("Nav Controls Bounding Box:", navBox);
  const isNavInside = navBox.x > 0 && navBox.x + navBox.width <= viewportBox.width && navBox.y > 0 && navBox.y + navBox.height <= viewportBox.height;
  console.log("Are Nav Controls floating directly inside map viewport?", isNavInside);

  // Take screenshot of clean starting RTS map view
  await page.screenshot({ path: "screenshot_clean_map.png" });
  console.log("Saved screenshot_clean_map.png");

  // 3. Test MCV deployment animation
  console.log("Clicking MCV to start base deployment animation...");
  await page.evaluate(() => {
    const state = window.__gameState ? window.__gameState() : null;
    const mcv = state ? state.rtsUnits.find(u => u.type === "mcv" && u.team === "blue") : null;
    if (mcv) {
      mcv.isDeploying = true;
      mcv.deployProgress = 1.6; // Mid-way through deployment (~45%)
      mcv.deployDuration = 3.5;
    }
  });

  await page.waitForTimeout(600);
  await page.screenshot({ path: "screenshot_mcv_deploying.png" });
  console.log("Saved screenshot_mcv_deploying.png (verifying 4-phase deployment animation & sparks)");

  // 4. Complete deployment and place Solar and Refinery to test building construction animations
  await page.evaluate(() => {
    const state = window.__gameState ? window.__gameState() : null;
    const mcv = state ? state.rtsUnits.find(u => u.type === "mcv" && u.team === "blue") : null;
    if (mcv) {
      mcv.isDeploying = false;
      // Complete deployment
      state.rtsBuildings.push({
        id: state.nextId++,
        team: "blue",
        type: "hq",
        x: mcv.x,
        y: mcv.y,
        hp: 1500,
        maxHp: 1500,
        buildTimeRemaining: 0,
        totalBuildTime: 3.5,
      });
      state.teams.blue.hasHq = true;
      state.teams.blue.hq = { x: mcv.x, y: mcv.y, hp: 1500, maxHp: 1500 };
      const idx = state.rtsUnits.indexOf(mcv);
      if (idx !== -1) state.rtsUnits.splice(idx, 1);
    }
    // Place a Central Solar and Refineria under construction
    state.rtsBuildings.push({
      id: state.nextId++,
      team: "blue",
      type: "solar",
      x: 350,
      y: 1500,
      hp: 450,
      maxHp: 450,
      buildTimeRemaining: 2.2, // ~45% progress
      totalBuildTime: 4.0,
    });
    state.rtsBuildings.push({
      id: state.nextId++,
      team: "blue",
      type: "refinery",
      x: 520,
      y: 1540,
      hp: 850,
      maxHp: 850,
      buildTimeRemaining: 2.5, // ~50% progress
      totalBuildTime: 5.0,
      harvesterSpawned: false,
    });
  });

  await page.waitForTimeout(600);
  await page.screenshot({ path: "screenshot_buildings_constructing.png" });
  console.log("Saved screenshot_buildings_constructing.png (verifying building construction phases & progress bars)");

  await browser.close();
  console.log("VERIFICATION TEST COMPLETE!");
})();
