import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`http://localhost:3023/?v=${Date.now()}`, { waitUntil: 'networkidle' });

const info = await page.evaluate(() => {
  const img = document.querySelector('img[src="/ondra-headshot.jpg"]');
  const r = img.getBoundingClientRect();
  return {
    displayW: r.width,
    displayH: r.height,
    naturalW: img.naturalWidth,
    naturalH: img.naturalHeight,
  };
});
console.log('trust strip avatar:', info);

await page.locator('img[src="/ondra-headshot.jpg"]').screenshot({
  path: '../bodyandmindon-web/scripts/_tmp-headshot-56px.png',
});

await browser.close();
