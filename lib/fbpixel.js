// /lib/fbpixel.js
// Meta Pixel (Facebook Pixel) helper.
// Dataset: "Body and Mind ON web" — vytvořeno 2026-07-15.
// ID pixelu je veřejné (běží v prohlížeči klienta), takže ho lze držet v kódu.
// Přes NEXT_PUBLIC_FB_PIXEL_ID se dá přepsat (např. testovací pixel ve stagingu).

export const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID || '1036330942227224';

/** Je pixel načtený a připravený? */
const ready = () => typeof window !== 'undefined' && typeof window.fbq === 'function';

/** Zobrazení stránky. Základní kód pixelu ho pošle sám při načtení;
 *  tohle je pro přechody mezi stránkami v rámci Next.js (client-side routing). */
export const pageview = () => {
  if (!ready()) return;
  window.fbq('track', 'PageView');
};

/** Standardní událost Mety, např. 'CompleteRegistration'. */
export const event = (name, options = {}) => {
  if (!ready()) return;
  window.fbq('track', name, options);
};

/** Vlastní (nestandardní) událost. */
export const customEvent = (name, options = {}) => {
  if (!ready()) return;
  window.fbq('trackCustom', name, options);
};

/** Základní kód pixelu vkládaný do <Script> v _app.js. */
export const FB_PIXEL_BASE_CODE = `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${FB_PIXEL_ID}');
fbq('track', 'PageView');
`;
