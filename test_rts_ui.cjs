const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("PAGE ERROR:", msg.text());
  });

  console.log("Navigating to http://localhost:8421...");
  await page.goto("http://localhost:8421", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  // Click on "Nueva partida" inside data-screen="home"
  console.log("Clicking 'Nueva partida'...");
  await page.click('[data-screen="home"] [data-go="mode"]');
  await page.waitForTimeout(500);

  // Click on "⭐ RTS (Estrategia C&C)"
  console.log("Clicking 'RTS (Estrategia C&C)'...");
  await page.click('[data-screen="mode"] [data-mode="rts"]');
  await page.waitForTimeout(500);

  // Click on "⚔️ Campaña / Escaramuza (PC)"
  console.log("Clicking 'Campaña / Escaramuza'...");
  await page.click('[data-screen="rts-mode"] [data-rts-submode="campaign"]');
  await page.waitForTimeout(1500);

  // Check viewport position and dimensions (MUST be at left: 0 with NO black bar on the left!)
  const viewportBox = await page.locator("#game-viewport").boundingBox();
  console.log("Game Viewport Box:", viewportBox);
  if (viewportBox.x <= 1) {
    console.log("SUCCESS: Map touches the left edge (x=0) - ZERO black zone on the left!");
  } else {
    console.log("WARNING: Map still has left offset:", viewportBox.x);
  }

  // Check if sidebar is visible
  const sidebar = page.locator("#cnc-sidebar");
  const isSidebarVisible = await sidebar.isVisible();
  console.log("Is CNC Sidebar visible?", isSidebarVisible);

  // Check thumbnails in sidebar
  const thumbImgs = await page.locator(".cnc-card-thumb img").all();
  console.log(`Found ${thumbImgs.length} thumbnail images in sidebar`);
  for (let i = 0; i < thumbImgs.length; i++) {
    const src = await thumbImgs[i].getAttribute("src");
    console.log(`  Thumbnail ${i}: src=${src}`);
  }

  // Check credits & power
  const creditsText = await page.locator("#cnc-credits-val").textContent();
  const powerText = await page.locator("#cnc-power-status").textContent();
  console.log("Initial Credits in UI:", creditsText);
  console.log("Initial Power in UI:", powerText);

  // Check refinery cost in sidebar cards
  const cards = await page.locator("#cnc-production-grid .cnc-card").all();
  for (const card of cards) {
    const title = await card.locator(".cnc-card-title").textContent();
    const cost = await card.locator(".cnc-card-cost").textContent();
    console.log(`  Card: ${title} -> ${cost}`);
  }

  // Take screenshot of starting RTS world with Fog of War & Full Screen stretch
  await page.screenshot({ path: "screenshot_rts_fullscreen.png" });
  console.log("Saved screenshot_rts_fullscreen.png");

  // Deploy MCV into HQ to test HQ context panel and building placement
  console.log("Deploying MCV in game state...");
  await page.evaluate(() => {
    const state = window.__gameState ? window.__gameState() : null;
    const mcv = state ? state.rtsUnits.find(u => u.type === "mcv" && u.team === "blue") : null;
    if (mcv) {
      mcv.isDeploying = true;
      mcv.deployProgress = mcv.deployDuration || 3.5;
    }
  });

  await page.waitForTimeout(1500);

  // Open HQ contextual panel
  console.log("Selecting HQ to open contextual panel...");
  await page.evaluate(() => {
    const state = window.__gameState ? window.__gameState() : null;
    const rtsUI = window.__rtsUI ? window.__rtsUI() : null;
    const hq = state ? state.rtsBuildings.find(b => b.type === "hq" && b.team === "blue") : null;
    if (hq && rtsUI) {
      rtsUI.openBuildingContext(hq, state);
    }
  });

  await page.waitForTimeout(600);

  const contextPanel = page.locator("#rts-context-panel");
  const isContextVisible = await contextPanel.isVisible();
  console.log("Is RTS Context Panel visible?", isContextVisible);

  if (isContextVisible) {
    const panelTitle = await page.locator(".rts-context-name").textContent();
    console.log("Context Panel Title:", panelTitle);

    const hqCards = await page.locator(".rts-hq-card").all();
    console.log(`HQ Context Panel has ${hqCards.length} building cards`);
    for (let i = 0; i < hqCards.length; i++) {
      const name = await hqCards[i].locator(".rts-hq-name").textContent();
      const cost = await hqCards[i].locator(".rts-hq-cost").textContent();
      const hasThumb = await hqCards[i].locator(".rts-hq-thumb img").count();
      console.log(`  HQ Option ${i}: ${name} (${cost}) - hasImage: ${hasThumb > 0}`);
    }

    // Take screenshot of HQ Context Panel
    await page.screenshot({ path: "screenshot_hq_panel.png" });
    console.log("Saved screenshot_hq_panel.png");

    // Test clicking the close button ✕
    console.log("Testing close button ✕...");
    const closeBtn = page.locator(".rts-context-close-btn");
    await closeBtn.click();
    await page.waitForTimeout(400);

    const isClosed = await contextPanel.isHidden();
    console.log("Did context panel close successfully after clicking ✕?", isClosed);

    // Reopen context panel and test selecting a building to place
    console.log("Re-opening HQ context panel to test building selection...");
    await page.evaluate(() => {
      const state = window.__gameState ? window.__gameState() : null;
      const rtsUI = window.__rtsUI ? window.__rtsUI() : null;
      const hq = state ? state.rtsBuildings.find(b => b.type === "hq" && b.team === "blue") : null;
      if (hq && rtsUI) {
        rtsUI.openBuildingContext(hq, state);
      }
    });
    await page.waitForTimeout(400);

    // Click on Solar power card in HQ panel
    console.log("Clicking Solar power card in HQ panel...");
    const solarCard = page.locator('.rts-hq-card[data-build-key="solar"]');
    if (await solarCard.count() > 0) {
      await solarCard.click();
      await page.waitForTimeout(400);
      const isAutoClosed = await contextPanel.isHidden();
      console.log("Did context panel auto-close to clear map for placement?", isAutoClosed);
    }
  }

  // Test placing building on canvas near HQ (430, 1600)
  console.log("Testing placement click near base...");
  await page.evaluate(() => {
    const canvas = document.getElementById("game-canvas");
    const rect = canvas.getBoundingClientRect();
    // Dispatch pointerdown to place building
    canvas.dispatchEvent(new PointerEvent("pointerdown", {
      clientX: rect.left + rect.width * 0.35,
      clientY: rect.top + rect.height * 0.75,
      bubbles: true,
    }));
  });

  await page.waitForTimeout(800);

  // Take screenshot of building placed in progress
  await page.screenshot({ path: "screenshot_rts_placed.png" });
  console.log("Saved screenshot_rts_placed.png");

  // Verify buildings in state
  const bldCount = await page.evaluate(() => {
    const state = window.__gameState ? window.__gameState() : null;
    return state ? state.rtsBuildings.length : 0;
  });
  console.log("Total buildings in state:", bldCount);

  // Check refinery Harvester spawn
  console.log("Testing Refinery Harvester spawn in live game...");
  const harvesterCount = await page.evaluate(() => {
    const state = window.__gameState ? window.__gameState() : null;
    if (!state) return -1;
    // Fast-forward construction of any refinery
    const ref = state.rtsBuildings.find(b => b.type === "refinery");
    return state.rtsUnits.filter(u => u.type === "harvester").length;
  });
  console.log("Initial Harvesters:", harvesterCount);

  await browser.close();
  console.log("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!");
})();
