/* Reproducible gameplay stills for the CrazyGames previews. Requires Playwright. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'stills');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const stages = [0, 2, 5, 8, 12, 16];

async function runVariant(browser, name, width, height, dpr) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
  });
  await context.route('https://sdk.crazygames.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.CrazyGames={SDK:{init:async()=>{},game:{gameplayStart(){},gameplayStop(){},happytime(){}}}};',
  }));
  const page = await context.newPage();
  await page.addInitScript(() => {
    let seed = 12648430;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  });
  await page.goto('http://127.0.0.1:8123/');
  await page.evaluate(() => {
    sleep = () => Promise.resolve();
    startGame(1, 1);
  });

  for (let stage = 0; stage <= stages[stages.length - 1]; stage++) {
    if (stages.includes(stage)) {
      await page.evaluate(() => {
        const coords = [...window.ST.board.keys()].map(k => k.split(',').map(Number));
        const xs = coords.map(c => c[0]), ys = coords.map(c => c[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const w = render.canvas.clientWidth, h = render.canvas.clientHeight;
        render.cam.x = (minX + maxX + 1) * TILE / 2;
        render.cam.y = (minY + maxY + 1) * TILE / 2;
        render.cam.scale = Math.min(2.4, w * .76 / ((maxX - minX + 1) * TILE),
          h * .76 / ((maxY - minY + 1) * TILE));
        render.hoverCell = null;
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: path.join(out, name + '-' + stage + '.png') });
      console.log(name, stage, await page.evaluate(() => window.ST.board.size));
    }
    if (stage === stages[stages.length - 1]) break;
    await page.evaluate(async () => {
      if (window.ST.phase !== 'place' || window.ST.turn !== 0) throw new Error('Not a human turn');
      const move = aiChooseMove(window.ST, window.ST.players[0]);
      if (!move) throw new Error('No legal move');
      window.ST.current.rot = move.rot;
      computeValidCells();
      onCellClick(move.x, move.y);
      if (window.ST.phase !== 'meeple') throw new Error('Tile was not placed');
      const spot = aiPickMeepleSpot(window.ST, window.ST.players[0],
        move.x, move.y, window.ST.meepleSpots);
      if (spot) await onSpotClick(spot);
      else await onSkipMeeple();
      if (window.ST.phase !== 'place' || window.ST.turn !== 0) {
        throw new Error('Bot turn did not finish');
      }
    });
  }
  await context.close();
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    await runVariant(browser, 'landscape', 1920, 1080, 1);
    await runVariant(browser, 'portrait', 690, 1035, 2);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
