import { chromium } from "playwright";

async function run() {
  console.log("Starting browser to reproduce RTS freeze...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  const errors = [];
  page.on("pageerror", (err) => {
    console.error(">>> [PAGE ERROR]:", err);
    errors.push(err.message + "\n" + err.stack);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error(">>> [CONSOLE ERROR]:", msg.text());
      errors.push(msg.text());
    }
  });

  await page.goto("http://127.0.0.1:8421", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);

  console.log("1. Starting RTS Campaign...");
  await page.evaluate(() => {
    window.__startNewGame(3, { mode: "rts", submode: "campaign" });
  });
  await page.waitForTimeout(1000);

  console.log("2. Deploying MCV...");
  await page.evaluate(() => {
    const s = window.__gameState();
    const mcv = s.rtsUnits.find((u) => u.team === "blue" && u.type === "mcv");
    if (mcv) window.__handleClick(mcv.x, mcv.y);
  });
  await page.waitForTimeout(4000);

  console.log("3. Building Solar ($300)...");
  await page.click('[data-build-key="solar"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__handleClick(380, 1520));
  await page.waitForTimeout(4500);

  console.log("4. Building Refinery ($800)...");
  await page.click('[data-build-key="refinery"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__handleClick(480, 1520));
  await page.waitForTimeout(5500);

  console.log("5. Building Barracks ($250)...");
  await page.click('[data-build-key="barracks"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__handleClick(340, 1600));
  await page.waitForTimeout(4500);

  console.log("6. Building Factory ($500)...");
  await page.evaluate(() => {
    const s = window.__gameState();
    s.teams.blue.credits += 1000; // ensure credits
  });
  await page.click('[data-build-key="factory"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__handleClick(420, 1600));
  await page.waitForTimeout(6500);

  console.log("7. Clicking Defenses tab...");
  await page.click('[data-tab="defenses"]');
  await page.waitForTimeout(500);

  console.log("8. Building Wall ($15) and Turret ($100)...");
  await page.click('[data-build-key="wall"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__handleClick(500, 1400);
  });
  await page.waitForTimeout(1000);

  await page.click('[data-build-key="turret_basic"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__handleClick(530, 1420);
  });
  await page.waitForTimeout(4500);

  console.log("9. Letting simulation run for 15 seconds while AI and Harvester interact...");
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    const status = await page.evaluate(() => {
      const s = window.__gameState();
      return {
        isRts: s?.isRts,
        unitsCount: s?.rtsUnits?.length,
        bldCount: s?.rtsBuildings?.length,
        winner: s?.winner,
        credits: s?.teams?.blue?.credits,
        tracers: s?.rtsTracers?.length,
      };
    });
    console.log(`[Second ${i + 1}] Status:`, status);
  }

  await page.screenshot({ path: "scratch_inspect/debug_rts_after_15s.png" });
  console.log("Screenshot taken.");

  await browser.close();
  console.log("Errors encountered:", errors.length);
  if (errors.length > 0) {
    console.error("ALL ERRORS:\n" + errors.join("\n---\n"));
  }
}

run().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
