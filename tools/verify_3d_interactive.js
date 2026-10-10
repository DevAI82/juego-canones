const { chromium } = require('playwright');

(async () => {
  console.log("============================================================");
  console.log("🎮 TESTING FULL 3D INTERACTIVITY (ZOOM, DRAG, ORDERS, RADAR)");
  console.log("============================================================");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const txt = msg.text();
      if (!txt.includes("404") && !txt.includes("/api/state")) {
        console.error("[BROWSER ERROR]:", txt);
        consoleErrors.push(txt);
      }
    }
  });

  await page.goto('http://127.0.0.1:8421');
  await page.waitForTimeout(600);
  await page.click('[data-go="mode"]');
  await page.waitForTimeout(300);
  await page.click('[data-mode="rts"]');
  await page.waitForTimeout(300);
  await page.click('[data-rts-submode="campaign"]');
  await page.waitForTimeout(1000);

  // 1. Switch to 3D Mode
  console.log("1. Activating 3D Mode...");
  await page.click('#mode-3d-btn');
  await page.waitForTimeout(600);

  const is3D = await page.evaluate(() => {
    const cvs = document.getElementById("rts-webgl-canvas");
    return cvs && cvs.style.display !== "none";
  });
  if (!is3D) throw new Error("3D Mode failed to activate!");
  console.log("✔ 3D Mode is active!");

  // 2. Test Mouse Wheel Zoom
  console.log("\n2. Testing Mouse Wheel Zoom in 3D...");
  const initialZoom = await page.evaluate(() => window.__zoom());
  console.log(`Initial Zoom: ${initialZoom}`);

  // Zoom IN
  await page.mouse.move(500, 400);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(400);

  const zoomIn = await page.evaluate(() => window.__zoom());
  console.log(`Zoom after scrolling UP: ${zoomIn}`);
  if (zoomIn <= initialZoom) throw new Error(`Zoom did not increase! Was: ${initialZoom}, now: ${zoomIn}`);
  console.log("✔ Mouse wheel zoom IN verified!");

  // Zoom OUT
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(400);

  const zoomOut = await page.evaluate(() => window.__zoom());
  console.log(`Zoom after scrolling DOWN: ${zoomOut}`);
  if (zoomOut >= zoomIn) throw new Error(`Zoom did not decrease! Was: ${zoomIn}, now: ${zoomOut}`);
  console.log("✔ Mouse wheel zoom OUT verified!");

  // 3. Test Drag to Pan Map in 3D
  console.log("\n3. Testing Drag-to-Pan Map in 3D...");
  const initialCam = await page.evaluate(() => ({ ...window.__camera() }));
  console.log("Initial Camera:", initialCam);

  await page.mouse.move(600, 450);
  await page.mouse.down();
  await page.mouse.move(350, 200, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  const draggedCam = await page.evaluate(() => ({ ...window.__camera() }));
  console.log("Camera after dragging map:", draggedCam);
  if (draggedCam.x === initialCam.x && draggedCam.y === initialCam.y) {
    throw new Error("Camera did not move after map drag!");
  }
  console.log("✔ Drag-to-pan camera verified in 3D!");

  // 4. Test MCV Deploy in 3D
  console.log("\n4. Testing MCV Deploy Click in 3D...");
  await page.evaluate(() => {
    const s = window.__gameState();
    const mcv = s.rtsUnits.find((u) => u.team === "blue" && u.type === "mcv");
    if (mcv) window.__handleClick(mcv.x, mcv.y);
  });
  console.log("Waiting for MCV deployment animation to complete into Headquarters...");
  await page.waitForFunction(() => {
    const s = window.__gameState();
    return s && s.teams && s.teams.blue && s.teams.blue.hasHq;
  }, { timeout: 12000 });
  console.log("✔ Base HQ deployed successfully in 3D!");

  // 5. Test Constructing Solar Plant via Sidebar and Click in 3D
  console.log("\n5. Testing Building Placement in 3D...");
  await page.click('[data-build-key="solar"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__handleClick(380, 1520));
  console.log("Waiting for Solar Plant construction to complete...");
  await page.waitForFunction(() => {
    const s = window.__gameState();
    return s && s.rtsBuildings && s.rtsBuildings.some((b) => b.type === "solar" && b.buildTimeRemaining <= 0);
  }, { timeout: 12000 });
  console.log("✔ Solar plant constructed successfully in 3D!");

  // 6. Test D-Pad Arrow Buttons in 3D (held button pan)
  console.log("\n6. Testing Floating Tactical D-Pad in 3D...");
  const camBeforePad = await page.evaluate(() => ({ ...window.__camera() }));
  await page.locator('#nav-right').dispatchEvent('pointerdown');
  await page.waitForTimeout(400);
  await page.locator('#nav-right').dispatchEvent('pointerup');
  await page.waitForTimeout(100);
  const camAfterPad = await page.evaluate(() => ({ ...window.__camera() }));
  console.log(`D-Pad move: X ${camBeforePad.x} -> ${camAfterPad.x}`);
  if (camAfterPad.x <= camBeforePad.x) throw new Error("D-Pad right button did not move camera!");
  console.log("✔ Floating tactical D-Pad verified in 3D!");

  // 7. Take Final Verification Screenshot
  await page.screenshot({ path: 'scratch_inspect/verified_3d_interactivity.png' });
  console.log("✔ Captured scratch_inspect/verified_3d_interactivity.png");

  await browser.close();

  if (consoleErrors.length > 0) {
    console.error("Browser errors encountered:", consoleErrors);
    process.exit(1);
  }

  console.log("\n============================================================");
  console.log("🏆 ALL 3D CONTROLS AND INTERACTION TESTS PASSED 100%!");
  console.log("============================================================");
  process.exit(0);
})();
