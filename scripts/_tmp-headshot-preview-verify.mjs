import { chromium } from 'playwright';
import crypto from 'crypto';
import fs from 'fs';

const preview =
  'https://bodyandmindon-web-git-feat-close-8741ca-progen-designs-projects.vercel.app/?_vercel_share=zL2IjJZAIhw5L3pZc1C55THQLHkm6kjV&v=556823d';
const diskPath = '../bodyandmindon-web/public/ondra-headshot.jpg';
const diskHash = crypto.createHash('md5').update(fs.readFileSync(diskPath)).digest('hex');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(preview, { waitUntil: 'networkidle' });

const info = await page.evaluate(async () => {
  const img = document.querySelector('img[src="/ondra-headshot.jpg"]');
  const r = img.getBoundingClientRect();
  const res = await fetch(img.src);
  const buf = await res.arrayBuffer();
  return {
    displayW: r.width,
    displayH: r.height,
    naturalW: img.naturalWidth,
    naturalH: img.naturalHeight,
    fetchedBytes: buf.byteLength,
    fetchedType: res.headers.get('content-type'),
  };
});

console.log('avatar:', info);
console.log('disk bytes:', fs.statSync(diskPath).size, 'hash:', diskHash);

await page.locator('img[src="/ondra-headshot.jpg"]').screenshot({
  path: '../bodyandmindon-web/scripts/_tmp-headshot-preview-56px.png',
});

await browser.close();
