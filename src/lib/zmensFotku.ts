import { MAX_HRANA_PX } from '../components/komunita/typy';

/**
 * ZMENŠENÍ FOTKY V PROHLÍŽEČI, JEŠTĚ PŘED ODESLÁNÍM.
 *
 * Fotka z telefonu má běžně 4 MB a 4000 px. Posílat ji celou znamená na
 * mobilních datech dlouhé čekání a u čtyř fotek naráz i riziko, že request
 * spadne na limitu těla. Canvas ji zmenší na stejnou hranu, jakou pak
 * použije server (`MAX_HRANA_PX`), takže se posílá ~200 kB místo 4 MB.
 *
 * SERVER SE NA TOHLE NESPOLÉHÁ. Zmenšení tady je kvůli rychlosti, ne kvůli
 * bezpečnosti — `lib/community.js` velikost, typ i EXIF řeší znovu. Co
 * přijde z prohlížeče, je vždycky jen návrh.
 *
 * Vedlejší efekt, na který spoléháme: překreslením přes canvas zmizí EXIF
 * (tedy i GPS souřadnice) už v telefonu, takže se na server ani nedostane.
 */
export async function zmensFotku(soubor: File, maxHrana: number = MAX_HRANA_PX): Promise<string> {
  const bitmapa = await nactiObrazek(soubor);

  const delsi = Math.max(bitmapa.width, bitmapa.height);
  const pomer = delsi > maxHrana ? maxHrana / delsi : 1;
  const sirka = Math.max(1, Math.round(bitmapa.width * pomer));
  const vyska = Math.max(1, Math.round(bitmapa.height * pomer));

  const platno = document.createElement('canvas');
  platno.width = sirka;
  platno.height = vyska;

  const ctx = platno.getContext('2d');
  if (!ctx) throw new Error('Fotku se nepodařilo zpracovat.');
  ctx.drawImage(bitmapa, 0, 0, sirka, vyska);

  if ('close' in bitmapa && typeof bitmapa.close === 'function') bitmapa.close();
  return platno.toDataURL('image/jpeg', 0.8);
}

/**
 * `createImageBitmap` umí otočit fotku podle EXIF orientace, jinak by
 * snímky z telefonu ležely na boku. Starší Safari ho nemá, tam padáme
 * zpátky na `<img>` (bez otočení, ale s fotkou).
 */
async function nactiObrazek(soubor: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(soubor, { imageOrientation: 'from-image' });
    } catch {
      // padáme na <img> níž
    }
  }

  return new Promise((splnit, zamitnout) => {
    const url = URL.createObjectURL(soubor);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      splnit(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      zamitnout(new Error('Fotku se nepodařilo načíst.'));
    };
    img.src = url;
  });
}
