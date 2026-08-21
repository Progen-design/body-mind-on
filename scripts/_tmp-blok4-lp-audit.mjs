import { chromium } from 'playwright';

const preview =
  'https://bodyandmindon-web-git-feat-close-8741ca-progen-designs-projects.vercel.app/?_vercel_share=zL2IjJZAIhw5L3pZc1C55THQLHkm6kjV';

const anchors = [
  { href: '#system', id: 'system' },
  { href: '#autopilot', id: 'autopilot' },
  { href: '#jak-to-funguje', id: 'jak-to-funguje' },
  { href: '#ondra', id: 'ondra' },
  { href: '#ted', id: 'ted' },
  { href: '#cenik', id: 'cenik' },
  { href: '#faq', id: 'faq' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(preview, { waitUntil: 'networkidle' });

const headerH = await page.evaluate(() => {
  const header = document.querySelector('header');
  return header ? header.getBoundingClientRect().height : 72;
});

const scrollOffset = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--scroll-offset').trim(),
);

console.log('headerH:', headerH, 'scroll-offset CSS:', scrollOffset);

for (const { href, id } of anchors) {
  await page.evaluate((h) => {
    location.hash = h.slice(1);
  }, href);
  await page.waitForTimeout(600);

  const result = await page.evaluate((targetId) => {
    const el = document.getElementById(targetId);
    if (!el) return { error: 'missing element' };
    const r = el.getBoundingClientRect();
    const offset = parseFloat(getComputedStyle(el).scrollMarginTop || '0');
    return {
      top: r.top,
      scrollMarginTop: offset,
      visibleUnderHeader: r.top >= 0 && r.top <= 120,
    };
  }, id);

  const ok = result.top >= -4 && result.top <= 100;
  console.log(`${href}: top=${result.top?.toFixed?.(1)} scroll-margin=${result.scrollMarginTop} => ${ok ? 'PASS' : 'FAIL'}`);
}

await page.setViewportSize({ width: 375, height: 812 });
await page.goto(`${preview}&mobile=1`, { waitUntil: 'networkidle' });
await page.screenshot({ path: '../bodyandmindon-web/scripts/_tmp-mobile-375-home.png', fullPage: false });

await page.goto('https://bodyandmindon-web-git-feat-close-8741ca-progen-designs-projects.vercel.app/faq?_vercel_share=zL2IjJZAIhw5L3pZc1C55THQLHkm6kjV', { waitUntil: 'networkidle' });
await page.screenshot({ path: '../bodyandmindon-web/scripts/_tmp-mobile-375-faq.png', fullPage: false });

await browser.close();
console.log('mobile screenshots saved');
