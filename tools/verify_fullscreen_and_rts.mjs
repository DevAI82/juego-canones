import { chromium } from "playwright";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const errors = [];
  page.on("pageerror", (err) => errors.push(`[PageError] ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[ConsoleError] ${msg.text()}`);
  });

  console.log("1. Opening http://127.0.0.1:8421/ at 1920x1080...");
  await page.goto("http://127.0.0.1:8421/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__startNewGame === "function");
  await page.waitForTimeout(500);

  // Take screenshot of main view
  await page.screenshot({ path: "scratch_inspect/verified_fullscreen_home.png" });
  console.log("Saved scratch_inspect/verified_fullscreen_home.png");

  // Check Level 4 Defense mode
  console.log("2. Launching Level 4 Defense...");
  await page.evaluate(() => {
    window.__startNewGame(4, { mode: "defense" });
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "scratch_inspect/verified_fullscreen_level4.png" });
  console.log("Saved scratch_inspect/verified_fullscreen_level4.png");

  // Check RTS mode (Campaign)
  console.log("3. Launching RTS Mode (Campaign)...");
  await page.evaluate(() => {
    window.__startNewGame(3, { mode: "rts", submode: "campaign" });
  });
  await page.waitForTimeout(2500); // let it run for 2.5 seconds

  const stateInfo = await page.evaluate(() => {
    const s = window.__gameState();
    return {
      isRts: s?.isRts,
      mode: s?.mode,
      credits: s?.teams?.blue?.credits,
      units: s?.rtsUnits?.length,
      paused: s?.paused,
    };
  });
  console.log("RTS state after 2.5 seconds:", stateInfo);

  // Take screenshot of RTS mode
  await page.screenshot({ path: "scratch_inspect/verified_rts_running.png" });
  console.log("Saved scratch_inspect/verified_rts_running.png");

  console.log("Total errors encountered:", errors.length);
  if (errors.length > 0) {
    console.error("Errors:\n" + errors.join("\n"));
  }

  await browser.close();
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
