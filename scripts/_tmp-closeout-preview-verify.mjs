import { chromium } from 'playwright';

const lp =
  'https://bodyandmindon-web-git-feat-closeout-lp-progen-designs-projects.vercel.app/?_vercel_share=kWGw5gDFizmsH8SJZaYQADZKHArS3XA8';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(lp, { waitUntil: 'networkidle' });

const headBytes = await page.evaluate(async () => {
  const r = await fetch('/ondra-headshot.jpg');
  return (await r.arrayBuffer()).byteLength;
});

for (const id of ['cenik', 'ondra', 'jak-to-funguje']) {
  await page.evaluate((i) => {
    location.hash = i;
  }, id);
  await page.waitForTimeout(500);
  const top = await page.evaluate((i) => document.getElementById(i).getBoundingClientRect().top, id);
  console.log(`LP #${id} top=${top.toFixed(1)} ${top >= 80 && top <= 96 ? 'PASS' : 'FAIL'}`);
}
console.log(`LP headshot bytes=${headBytes} ${headBytes < 30000 ? 'PASS' : 'FAIL'}`);

const app =
  'https://body-mind-on-git-feat-closeout-app-progen-designs-projects.vercel.app/?_vercel_share=4gVT3xbpv7n2OwThZdfC0AAzKlmHUK7U';
const html = await (await fetch(`${app}/profil`)).text();
const chunks = html.match(/_next\/static\/chunks\/[^"']+\.js/g) || [];
let ok = false;
const base = 'https://body-mind-on-git-feat-closeout-app-progen-designs-projects.vercel.app';
for (const p of chunks.slice(0, 40)) {
  const t = await (await fetch(`${base}/${p}`)).text();
  if (t.includes('habit-ui-progress-sep') && t.includes('94a3b8')) {
    ok = true;
    break;
  }
}
console.log(`APP chunks=${chunks.length} progress fix in bundle ${ok ? 'PASS' : 'FAIL'}`);

await browser.close();
