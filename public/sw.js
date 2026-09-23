/*
 * MINIMÁLNÍ SERVICE WORKER — jen kvůli instalovatelnosti („Přidat na plochu").
 *
 * Nic necachuje, nic nepodvrhuje, neumí offline ani push. Fetch handler
 * nevolá respondWith(), takže každý požadavek jde do sítě přesně jako bez
 * service workeru — žádné riziko, že by appka ukazovala stará data nebo
 * starý build.
 *
 * Když ho bude potřeba odstranit: nahraď obsah za
 * `self.addEventListener('install', () => self.skipWaiting());
 *  self.addEventListener('activate', () => self.registration.unregister());`
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Passthrough: bez respondWith() prohlížeč vyřídí požadavek sám.
});
