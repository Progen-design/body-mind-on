/**
 * Parsování HTML AI plánu (DOMParser) — sdílené mezi stránkou a PlanViewer,
 * aby šlo lazy-loadovat PlanViewer bez táhnout celý komponent do initial bundle.
 */

/** Normalizuje text pro porovnání (bez diakritiky, lowercase). */
function norm(s) {
  if (!s || typeof s !== 'string') return '';
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/** Stejná normalizace jako backend (plan-enrichment) pro spolehlivý lookup. */
function normalizeLookupKey(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePlanHtml(html) {
  if (!html || typeof document === 'undefined') return null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const result = {
      personal: [],
      macros: [],
      days: [],
      recipes: [],
      workout: '',
      regeneration: [],
      shoppingList: [],
      mindsetTip: '',
      rawSections: {},
    };

    const sections = doc.querySelectorAll('section, body');
    const root = sections[0] || doc.body;
    const allH3 = root.querySelectorAll('h3');
    allH3.forEach((h3) => {
      const title = (h3.textContent || '').trim();
      let next = h3.nextElementSibling;
      const list = [];
      let htmlContent = '';
      let rawSectionHtml = '';
      while (next && next.tagName !== 'H3') {
        rawSectionHtml += next.outerHTML || '';
        if (next.tagName === 'UL') {
          next.querySelectorAll('li').forEach((li) => list.push(li.innerHTML || li.textContent));
        } else if (next.tagName === 'P' || next.tagName === 'H4') {
          htmlContent += next.outerHTML;
        }
        next = next.nextElementSibling;
      }
      if (title && rawSectionHtml && !/trénink|treninkovy/i.test(title)) result.rawSections[title] = rawSectionHtml;

      if (/Osobní údaje|údaje & cíle/i.test(title)) {
        result.personal = list.map((item) => {
          const m = (item.replace(/<[^>]+>/g, ' ').trim() || '').match(/^([^:]+):\s*(.+)$/);
          return m ? { label: m[1].trim(), value: m[2].trim() } : null;
        }).filter(Boolean);
      } else if (/Denní cíle|makro/i.test(title)) {
        result.macros = list.map((item) => {
          const m = (item.replace(/<[^>]+>/g, ' ').trim() || '').match(/^([^:]+):\s*(.+)$/);
          return m ? { label: m[1].trim(), value: m[2].trim() } : null;
        }).filter(Boolean);
      } else if (/Jídelníček|celý týden/i.test(title)) {
        const dayNames = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
        const mealTypes = ['Snídaně', 'Oběd', 'Večeře', 'Svačina', 'Snidane', 'Obed', 'Vecere', 'Svacina'];
        let el = h3.nextElementSibling;
        while (el) {
          const isDayHeader = el.tagName === 'H4' || el.tagName === 'H3';
          const dayName = (el.textContent || '').trim();
          if (isDayHeader && dayNames.some((d) => dayName.includes(d))) {
            const meals = [];
            let trainingHtmlForDay = '';
            let nextDay = el.nextElementSibling;
            while (nextDay && nextDay.tagName !== 'H4' && nextDay.tagName !== 'H3') {
              if (nextDay.tagName === 'P') {
                const labelEl = nextDay.querySelector('b, strong');
                const mealType = labelEl ? labelEl.textContent.replace(/:\s*$/, '').trim() : '';
                const rest = (nextDay.textContent || '')
                  .replace(labelEl?.textContent || '', '')
                  .replace(/^:\s*/, '')
                  .trim();
                const isMeal = mealTypes.some((m) => norm(mealType).includes(norm(m)));
                const paragraphText = (nextDay.textContent || '').trim();
                const isTrainingBlock =
                  /Trénink tento den|trenink tento den/i.test(mealType || '') ||
                  /Trénink tento den|trenink tento den/i.test(paragraphText);
                const mealKey = nextDay.getAttribute?.('data-meal-key')
                  ? normalizeLookupKey(nextDay.getAttribute('data-meal-key'))
                  : null;
                const recipeAttr = nextDay.getAttribute?.('data-recipe-id');
                let recipe_id;
                if (recipeAttr != null && String(recipeAttr).trim() !== '') {
                  const n = parseInt(String(recipeAttr).trim(), 10);
                  if (!Number.isNaN(n)) recipe_id = n;
                }
                const html_image_url = (nextDay.getAttribute?.('data-image-url') || '').trim() || undefined;
                const html_image_trust_level =
                  (nextDay.getAttribute?.('data-image-trust-level') || '').trim() || undefined;
                if (isMeal && (mealType || rest)) {
                  meals.push({
                    type: mealType || 'Jídlo',
                    text: rest,
                    fullHtml: nextDay.innerHTML,
                    meal_key: mealKey || undefined,
                    ...(recipe_id !== undefined ? { recipe_id } : {}),
                    ...(html_image_url ? { html_image_url } : {}),
                    ...(html_image_trust_level ? { html_image_trust_level } : {}),
                  });
                }
                if (isTrainingBlock) {
                  trainingHtmlForDay += nextDay.outerHTML || '';
                  const afterP = nextDay.nextElementSibling;
                  if (afterP && afterP.tagName === 'UL') {
                    trainingHtmlForDay += afterP.outerHTML || '';
                    nextDay = afterP;
                  }
                  nextDay = nextDay.nextElementSibling;
                  while (nextDay && nextDay.tagName !== 'H4' && nextDay.tagName !== 'H3') {
                    nextDay = nextDay.nextElementSibling;
                  }
                  continue;
                }
              }
              nextDay = nextDay.nextElementSibling;
            }
            result.days.push({
              dayName,
              meals,
              trainingHtml: trainingHtmlForDay,
            });
          }
          el = el.nextElementSibling;
        }
      } else if (/Recepty/i.test(title)) {
        const dayNames = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
        let el = h3.nextElementSibling;
        while (el && el.tagName !== 'H3') {
          if (el.tagName === 'H4') {
            const name = (el.textContent || '').trim();
            if (!dayNames.some((d) => name.includes(d))) {
              let nextR = el.nextElementSibling;
              let content = '';
              while (nextR && nextR.tagName !== 'H4' && nextR.tagName !== 'H3') {
                content += nextR.outerHTML;
                nextR = nextR.nextElementSibling;
              }
              if (name && content) result.recipes.push({ name, content });
            }
          }
          el = el.nextElementSibling;
        }
      } else if (/Trénink/i.test(title)) {
        let el = h3.nextElementSibling;
        while (el && el.tagName !== 'H3') {
          result.workout += el.outerHTML || '';
          el = el.nextElementSibling;
        }
      } else if (/Regenerace|Mindset/i.test(title) && !/Mindset na tento týden/i.test(title)) {
        result.regeneration = list;
      } else if (/Nákupní seznam/i.test(title)) {
        let el = h3.nextElementSibling;
        while (el && el.tagName !== 'H3') {
          if (el.tagName === 'UL') {
            el.querySelectorAll('li').forEach((li) => {
              const t = (li.textContent || '').trim();
              if (t) result.shoppingList.push(t);
            });
            break;
          }
          el = el.nextElementSibling;
        }
      } else if (/Mindset na tento týden/i.test(title)) {
        let el = h3.nextElementSibling;
        const parts = [];
        while (el && el.tagName !== 'H3') {
          if (el.tagName === 'P' || el.tagName === 'UL' || el.tagName === 'BLOCKQUOTE') {
            parts.push(el.innerHTML || el.textContent || '');
          }
          el = el.nextElementSibling;
        }
        result.mindsetTip = parts.join('\n');
      }
    });

    const dayOrder = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
    if (result.days.length > 0 && result.days.length < 7) {
      const byDay = {};
      result.days.forEach((d) => {
        const match = dayOrder.find((dn) => (d.dayName || '').includes(dn));
        if (match) byDay[match] = d;
      });
      const firstDayName = result.days[0]?.dayName || '';
      const firstIdx = dayOrder.findIndex((dn) => firstDayName.includes(dn));
      const rotated =
        firstIdx >= 0 ? [...dayOrder.slice(firstIdx), ...dayOrder.slice(0, firstIdx)] : dayOrder;
      result.days = rotated.map(
        (dn) => byDay[dn] || { dayName: dn, meals: [], trainingHtml: '', _placeholder: true }
      );
    }

    if (
      result.personal.length ||
      result.macros.length ||
      result.days.length ||
      Object.keys(result.rawSections).length > 0
    )
      return result;
    return null;
  } catch (e) {
    return null;
  }
}

export { parsePlanHtml };
