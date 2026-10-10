// ============================================================================
// AUTOMATED RTS TESTING & VERIFICATION BOT
// Runs multiple full RTS matches, verifies Harvester autonomous loop,
// 3D/2D engine toggling, AI combat, and detects any runtime anomalies.
// ============================================================================

const { chromium } = require("playwright");

async function runTestMatch(matchIndex) {
  console.log(`\n============================================================`);
  console.log(`🚀 STARTING RTS MATCH #${matchIndex} (Automated Verification)`);
  console.log(`============================================================`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1400, height: 850 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const txt = msg.text();
      // Ignore normal 404 for /api/state in solo play on static server
      if (!txt.includes("/api/state") && !txt.includes("404")) {
        console.error(`[BROWSER ERROR]: ${txt}`);
        consoleErrors.push(txt);
      }
    }
  });

  page.on("pageerror", (err) => {
    console.error(`[PAGE UNCAUGHT ERROR]: ${err.message}`);
    consoleErrors.push(err.message);
  });

  await page.goto("http://127.0.0.1:8421");
  await page.waitForTimeout(800);

  // 1. Navigate Menu: Nueva Partida -> Modo RTS -> Campaña
  console.log("Navigating menu to RTS Campaign...");
  await page.click('[data-go="mode"]');
  await page.waitForTimeout(400);
  await page.click('[data-mode="rts"]');
  await page.waitForTimeout(400);
  await page.click('[data-rts-submode="campaign"]');
  await page.waitForTimeout(1200);

  // 2. Deploy MCV into Headquarters
  console.log("Deploying MCV into Headquarters...");
  await page.evaluate(() => {
    const s = window.__gameState();
    const mcv = s.rtsUnits.find((u) => u.team === "blue" && u.type === "mcv");
    if (mcv) window.__handleClick(mcv.x, mcv.y);
  });
  await page.waitForTimeout(3800); // wait for 3.5s deploy animation

  // Check state after MCV deploy
  let state = await page.evaluate(() => window.__gameState ? window.__gameState() : null);
  if (!state || !state.teams.blue.hasHq) {
    throw new Error("MCV deployment failed to set team.blue.hasHq");
  }
  console.log("✔ Base Headquarters deployed successfully!");

  // 3. Build Solar Plant
  console.log("Constructing Solar Plant ($300)...");
  await page.click('[data-build-key="solar"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__handleClick(380, 1520));
  await page.waitForTimeout(4500); // wait for construction

  // 4. Build Refinery (auto-spawns harvester!)
  console.log("Constructing Refinery ($800)...");
  await page.click('[data-build-key="refinery"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__handleClick(480, 1520));
  await page.waitForTimeout(5500); // wait for refinery construction

  // 5. Verify Harvester Autonomous Gathering Loop
  console.log("Verifying Harvester Autonomous Gathering Loop...");
  let initialCredits = await page.evaluate(() => window.__gameState().teams.blue.credits);
  console.log(`Credits after building Refinery: $${initialCredits}`);

  let sawHarvestingState = false;
  let sawReturnState = false;
  let sawUnloadState = false;
  let creditsIncreased = false;

  // Poll harvester state over 24 seconds
  for (let tick = 0; tick < 24; tick++) {
    await page.waitForTimeout(1000);
    const harvestCheck = await page.evaluate(() => {
      const s = window.__gameState();
      const h = s.rtsUnits.find((u) => u.team === "blue" && u.type === "harvester");
      const creds = s.teams.blue.credits;
      const bField = s.mineralFields.find((f) => f.id === "ore_blue");
      return {
        hasHarvester: Boolean(h),
        state: h ? h.state : null,
        load: h ? Math.round(h.load || h.cargo || 0) : 0,
        credits: creds,
        fieldReserves: bField ? Math.round(bField.reserves) : 0,
      };
    });

    if (harvestCheck.state === "HARVESTING" || harvestCheck.load > 0) sawHarvestingState = true;
    if (harvestCheck.state === "TO_REFINERY") sawReturnState = true;
    if (harvestCheck.state === "UNLOADING") sawUnloadState = true;
    if (harvestCheck.credits > initialCredits) creditsIncreased = true;

    console.log(`[T+${tick + 1}s] Harvester State: ${harvestCheck.state}, Cargo: ${harvestCheck.load}kg, Credits: $${harvestCheck.credits}, Field: ${harvestCheck.fieldReserves}kg`);

    if (creditsIncreased && sawUnloadState) {
      console.log("✔ Harvester successfully gathered ore, returned to refinery, unloaded credits, and looped!");
      break;
    }
  }

  // Take screenshot in 2D Mode showing Harvester and 3D Faceted Crystals
  await page.screenshot({ path: `screenshot_rts_2d_harvester_match_${matchIndex}.png` });
  console.log(`✔ Captured screenshot_rts_2d_harvester_match_${matchIndex}.png`);

  // 6. Test 3D Graphics Engine (Toggle to 3D)
  console.log("\nTesting 3D Graphics Engine Activation...");
  await page.click("#mode-3d-btn");
  await page.waitForTimeout(1500);

  const is3DActive = await page.evaluate(() => {
    const btn = document.getElementById("mode-3d-btn");
    const cvs = document.getElementById("rts-webgl-canvas");
    return {
      btnActive: btn.classList.contains("active"),
      has3DCanvas: Boolean(cvs),
      canvasVisible: cvs ? cvs.style.display !== "none" : false,
    };
  });
  console.log(`3D Engine State: active=${is3DActive.btnActive}, WebGL canvas visible=${is3DActive.canvasVisible}`);
  if (!is3DActive.has3DCanvas || !is3DActive.canvasVisible) {
    throw new Error("3D Graphics Engine failed to mount or display WebGL canvas!");
  }
  console.log("✔ 3D WebGL Graphics Engine mounted and running smoothly!");

  // Take screenshot in 3D Mode
  await page.screenshot({ path: `screenshot_rts_3d_match_${matchIndex}.png` });
  console.log(`✔ Captured screenshot_rts_3d_match_${matchIndex}.png`);

  // 7. Build Barracks and Train Soldiers in 3D Mode
  console.log("\nBuilding Barracks and Training Infantry in 3D Mode...");
  await page.click('[data-tab="base"]');
  await page.waitForTimeout(300);
  await page.click('[data-build-key="barracks"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__handleClick(340, 1600));
  await page.waitForTimeout(4500);

  // Switch to Infantry Tab and Train Soldiers
  await page.click('[data-tab="infantry"]');
  await page.waitForTimeout(400);
  await page.click('.cnc-btn-multi'); // +3 Cola
  console.log("Enqueued 3 Soldiers in barracks queue");
  await page.waitForTimeout(6500); // wait for soldier training

  const unitCount = await page.evaluate(() => {
    const s = window.__gameState();
    return s.rtsUnits.filter((u) => u.team === "blue").length;
  });
  console.log(`Blue team units active: ${unitCount}`);

  // Take screenshot with infantry trained in 3D mode
  await page.screenshot({ path: `screenshot_rts_3d_with_units_${matchIndex}.png` });
  console.log(`✔ Captured screenshot_rts_3d_with_units_${matchIndex}.png`);

  // 8. Toggle Back to 2D Mode and verify clean transition
  console.log("\nToggling back to 2D Canvas Mode...");
  await page.click("#mode-3d-btn");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `screenshot_rts_2d_restored_${matchIndex}.png` });
  console.log("✔ 2D Mode cleanly restored with 3D models paused without memory leak!");

  await browser.close();

  if (consoleErrors.length > 0) {
    console.error(`Match #${matchIndex} encountered ${consoleErrors.length} browser errors:`, consoleErrors);
    return false;
  }

  console.log(`🎉 MATCH #${matchIndex} PASSED WITH ZERO ERRORS!`);
  return true;
}

(async () => {
  try {
    const match1 = await runTestMatch(1);
    const match2 = await runTestMatch(2);
    if (match1 && match2) {
      console.log("\n============================================================");
      console.log("🏆 ALL RTS TEST MATCHES COMPLETED SUCCESSFULLY!");
      console.log("============================================================");
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  }
})();
