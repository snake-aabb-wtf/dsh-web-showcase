/* Headless smoke test for the cloth simulation dev server.
 * Uses a fake camera device to exercise the full hand-gesture pipeline.
 * Run:  $env:NODE_PATH = 'C:\Users\Administrator\AppData\Roaming\npm\node_modules'; node smoke.cjs
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('[console] ' + msg.text());
  });
  page.on('pageerror', (err) => errors.push('[pageerror] ' + String(err)));

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500); // let the simulation settle

  const canvasBox = await page.locator('canvas.viewport').boundingBox();
  const hasGlError = await page.locator('.gl-error').count();
  const fpsText = await page.locator('.fps-badge').textContent().catch(() => '(no fps badge)');
  console.log('canvas box:', JSON.stringify(canvasBox));
  console.log('gl-error overlay count:', hasGlError);
  console.log('fps badge:', fpsText);

  // Drag the cloth with the mouse (existing interaction still works).
  await page.mouse.move(640, 330);
  await page.mouse.down();
  await page.mouse.move(500, 300, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(800);

  // --- Gesture mode: enable the camera toggle in the 手势控制 section ---
  const gestureToggle = page.locator('section:has(h2:text("手势控制")) label.ctl-toggle');
  await gestureToggle.click();
  const statusOk = await page
    .locator('section:has(h2:text("手势控制")) .gesture-msg')
    .textContent()
    .catch(() => '(no status)');
  console.log('gesture status:', statusOk.replace(/\s+/g, ' ').trim());

  // Wait for model load + camera start (up to 25s), then check the video feed.
  await page.waitForSelector('section:has(h2:text("手势控制")) .gesture-msg.ok', { timeout: 25000 }).catch(() => {});
  const videoState = await page.evaluate(() => {
    const v = document.querySelector('video.camera-bg');
    return v ? { visible: getComputedStyle(v).display !== 'none', playing: !v.paused, w: v.videoWidth, h: v.videoHeight, mirrored: getComputedStyle(v).transform } : null;
  });
  console.log('camera video:', JSON.stringify(videoState));

  // The WebGL canvas should now be transparent (camera bg) — clear alpha 0.
  const clearAlpha = await page.evaluate(() => {
    const e = window.__clothSim && window.__clothSim.engine;
    return e ? e.params.opacity : null;
  });
  console.log('params.opacity:', clearAlpha);

  await page.screenshot({ path: 'smoke-gesture.png' });

  const stats = await page.locator('.stats').textContent().catch(() => '(no stats)');
  console.log('stats:', stats.replace(/\s+/g, ' ').trim());

  const contact = await page.evaluate(() => {
    const e = window.__clothSim && window.__clothSim.engine;
    if (!e) return null;
    const sx = e.spherePos[0], sy = e.spherePos[1], sz = e.spherePos[2];
    const r = e.params.sphereRadius;
    const p = e.cloth.positions;
    let minD = Infinity;
    for (let i = 0; i < e.cloth.vertexCount; i++) {
      const dx = p[i * 3] - sx, dy = p[i * 3 + 1] - sy, dz = p[i * 3 + 2] - sz;
      const d = Math.hypot(dx, dy, dz);
      if (d < minD) minD = d;
    }
    return { minDist: minD, radius: r, touching: minD <= r + 0.02 };
  });
  console.log('sphere contact:', JSON.stringify(contact));

  console.log('errors:', errors.length ? errors.join('\n') : '(none)');

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
