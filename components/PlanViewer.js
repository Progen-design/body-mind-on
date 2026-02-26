// /components/PlanViewer.js – Grafické zobrazení AI plánu (wow efekt, obrázky u jídel)
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabaseClient';

// Obrázky jídel – NEJDELŠÍ SHODA. Žádný obecný klíč „zelenina“ (dával by všem stejnou mísu). Jen konkrétní jídla.
const DISH_IMAGES = [
  { keys: ['palačinky z mandlové', 'palacinky z mandlove', 'palačinky', 'palacinky', 'pancake'], url: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=280&fit=crop' },
  { keys: ['chia pudink s kokosovým', 'chia pudink s kokosovym', 'chia pudink', 'chia pudding'], url: 'https://images.unsplash.com/photo-1517673132405-a56a62b18ddb?w=400&h=280&fit=crop' },
  { keys: ['jogurt s bezlepkovými ovesnými', 'jogurt s ovesnými vločkami', 'ovesnými vločkami', 'ovesne vlocky', 'ovesné vločky'], url: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=400&h=280&fit=crop' },
  { keys: ['vejce na tvrdo s avokádem', 'vajec na tvrdo', 'vejce na tvrdo'], url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=280&fit=crop' },
  { keys: ['toasty s avokádovým krémem', 'toast s avokádovým', 'avokádovým krémem', 'avokadovym kremem', 'bezlepkové toasty'], url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=280&fit=crop' },
  { keys: ['červený salát s červenou řepou', 'cerveny salat s cervenou repou', 'červenou řepou', 'cervenou repou', 'řepou a bylinkami'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['zeleninové placky s jogurtovým', 'zeleninove placky', 'placky s jogurtem'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['hovězí steak s quinoa a zeleninovým salátem', 'hovezi steak s quinoa', 'hovězí steak s batátovou kaší', 'hovezi steak s batatovou kasi', 'hovězí steak s batátovou', 'steak s batátovou kaší', 'steak s quinoa'], url: 'https://images.unsplash.com/photo-1558030006-4502153934bb?w=400&h=280&fit=crop' },
  { keys: ['zeleninová polévka s čočkou', 'zeleninova polevka s cockou', 'polévka s čočkou', 'polevka s cockou'], url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=280&fit=crop' },
  { keys: ['zeleninové curry s luštěninami', 'zeleninove curry s lusteninami', 'curry s luštěninami a rýží', 'curry s lusteninami'], url: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=280&fit=crop' },
  { keys: ['tofu stir-fry s rýžovými nudlemi', 'tofu stir-fry se zeleninou', 'tofu stir-fry', 'stir-fry se zeleninou', 'stir-fry s rýžovými'], url: 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?w=400&h=280&fit=crop' },
  { keys: ['kuřecí stehno pečené', 'kureci stehno pecene', 'kuřecí stehno', 'kuřecí prso s pečenou'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['grilované kuřecí prso s brokolicí', 'grilovane kureci prso s brokolici', 'kuřecí prso s brokolicí', 'kureci prso s brokolici'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['brambory s kuřecím špenátem', 'brambory s kurecim', 'kuřecím špenátem'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['kuřecí salát s avokádem', 'kureci salat s avokadem', 'kuřecí salát'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['omeleta se špenátem a feta', 'omeleta se spinatem', 'omeleta', 'omelet', 'vajíčk', 'vejce', 'vajec'], url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=280&fit=crop' },
  { keys: ['kuřecí', 'kuře', 'chicken', 'zapečené kuře', 'grilované kuře', 'kureci prso'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['hovězí burger', 'beef burger', 'burger'], url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=280&fit=crop' },
  { keys: ['pečená ryba s bramborovou', 'pecena ryba s bramborovou', 'pečená ryba', 'pecena ryba', 'ryba s brambor'], url: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&h=280&fit=crop' },
  { keys: ['pečený losos s nokem', 'peceny losos s nokem', 'losos s cuketou', 'losos', 'salmon', 'pečený losos'], url: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&h=280&fit=crop' },
  { keys: ['quinoa salát s cizrnou a paprikou', 'quinoa salat s cizrnou', 'quinoa salát s avokádem', 'cizrnou a paprikou'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['cizrnový salát s červenou cibulí', 'cizrnovy salat', 'cizrnový salát'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['steak', 'hovězí', 'beef', 'pečený steak', 'hovězí steak'], url: 'https://images.unsplash.com/photo-1558030006-4502153934bb?w=400&h=280&fit=crop' },
  { keys: ['zeleninové curry', 'zeleninove curry', 'vegetable curry', 'curry s houbami'], url: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=280&fit=crop' },
  { keys: ['rizoto', 'risotto', 'houbové rizoto'], url: 'https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=400&h=280&fit=crop' },
  { keys: ['kari', 'curry', 'kokosové mléko', 'kokosove mleko'], url: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=280&fit=crop' },
  { keys: ['quinoa', 'bulgur'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['bramborová kaše', 'bramborova kase', 'bramborovou kaší', 'batátovou kaší', 'batatovou kasi'], url: 'https://images.unsplash.com/photo-1518013431117-eb2895b37a9d?w=400&h=280&fit=crop' },
  { keys: ['ovesná kaše', 'oatmeal', 'porridge', 'ovesna kase'], url: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=400&h=280&fit=crop' },
  { keys: ['jogurt', 'granola', 'müsli', 'parfait'], url: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=280&fit=crop' },
  { keys: ['smoothie s banánem a proteinem', 'smoothie s banánem', 'smoothie s proteinem', 'smoothie', 'koktejl'], url: 'https://images.unsplash.com/photo-1505252585461-04db1ebd3c2c?w=400&h=280&fit=crop' },
  { keys: ['houbové', 'houby', 'mushroom', 'žampion'], url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=280&fit=crop' },
  { keys: ['kuskus', 'couscous'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['polévka', 'polevka', 'soup'], url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=280&fit=crop' },
  { keys: ['těstovin', 'testovin', 'pasta', 'špagety', 'spagety', 'nokem', 'noky', 'gnocchi'], url: 'https://images.unsplash.com/photo-1551183053-bf91a1f81115?w=400&h=280&fit=crop' },
  { keys: ['rýže', 'ryze', 'rice'], url: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=280&fit=crop' },
  { keys: ['brambor', 'brambory'], url: 'https://images.unsplash.com/photo-1518013431117-eb2895b37a9d?w=400&h=280&fit=crop' },
  { keys: ['brokolic', 'brokolice'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['cuket', 'cuketa'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['feta', 'fetou'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['salát', 'salad'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['večeře', 'večere'], url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=280&fit=crop' },
  { keys: ['oběd', 'obed'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['snídaně', 'snidane'], url: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=400&h=280&fit=crop' },
  { keys: ['svačina', 'svacina'], url: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=280&fit=crop' },
];
const DEFAULT_MEAL_IMAGE = 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?w=400&h=280&fit=crop';

const PERSONAL_ICONS = {
  'Věk': '🎂',
  'Výška': '📏',
  'Váha': '⚖️',
  'Aktivita': '🏃',
  'Stres': '😌',
  'Typ práce': '💼',
  'Cíl': '🎯',
  'Frekvence cvičení': '📅',
};

/** Normalizuje text pro porovnání (bez diakritiky, lowercase). */
function norm(s) {
  if (!s || typeof s !== 'string') return '';
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Vybere obrázek podle názvu jídla. Používá NEJDELŠÍ SHODU (nejvíc specifický klíč vyhrává),
 * aby „Palačinky z mandlové mouky“ dostaly obrázek palačinek, ne těstovin nebo snídaně.
 */
function getMealImageByDish(mealText) {
  if (!mealText || typeof mealText !== 'string') return DEFAULT_MEAL_IMAGE;
  const plain = mealText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = norm(plain);
  let best = { url: DEFAULT_MEAL_IMAGE, keyLen: 0 };
  for (const { keys, url } of DISH_IMAGES) {
    for (const k of keys) {
      const nk = norm(k);
      if (nk && lower.includes(nk) && nk.length > best.keyLen) {
        best = { url, keyLen: nk.length };
      }
    }
  }
  return best.url;
}

function recipeContentOnly(html) {
  if (!html || typeof html !== 'string') return html;
  const lower = html.toLowerCase();
  const stopPhrases = ['tréninkový plán', 'treninkovy plan', 'regenerace', 'mindset'];
  for (const phrase of stopPhrases) {
    const idx = lower.indexOf(phrase);
    if (idx !== -1) {
      const before = html.slice(0, idx);
      const h3Start = before.lastIndexOf('<h3');
      if (h3Start !== -1) return before.slice(0, h3Start).trim();
      return before.trim();
    }
  }
  return html;
}

/** Fallback: sestaví nákupní seznam z bloků Suroviny v receptech */
function buildShoppingListFromRecipes(recipes) {
  if (!Array.isArray(recipes) || recipes.length === 0) return [];
  const seen = new Set();
  const out = [];
  const surovinyRe = /suroviny\s*:?\s*<\/b>\s*([\s\S]*?)(?=<p\s*><b>|$)/gi;
  const listRe = /<li[^>]*>([^<]*)<\/li>/gi;
  recipes.forEach((r) => {
    const content = r.content || '';
    const match = surovinyRe.exec(content);
    if (!match) return;
    const block = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const items = block.split(/[,;]|\s+-\s+/).map((s) => s.trim()).filter(Boolean);
    items.forEach((item) => {
      const n = item.toLowerCase().slice(0, 50);
      if (n && !seen.has(n)) { seen.add(n); out.push(item); }
    });
  });
  return out;
}

function parsePlanHtml(html) {
  if (!html || typeof document === 'undefined') return null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const result = { personal: [], macros: [], days: [], recipes: [], workout: '', regeneration: [], shoppingList: [], mindsetTip: '', rawSections: {} };

    const sections = doc.querySelectorAll('section, body');
    const root = sections[0] || doc.body;
    const allH3 = root.querySelectorAll('h3');
    allH3.forEach((h3) => {
      const title = (h3.textContent || '').trim();
      let next = h3.nextElementSibling;
      const list = [];
      let htmlContent = '';
      while (next && next.tagName !== 'H3') {
        if (next.tagName === 'UL') {
          next.querySelectorAll('li').forEach((li) => list.push(li.innerHTML || li.textContent));
        } else if (next.tagName === 'P' || next.tagName === 'H4') {
          htmlContent += next.outerHTML;
        }
        next = next.nextElementSibling;
      }

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
          if (el.tagName === 'H4') {
            const dayName = (el.textContent || '').trim();
            if (dayNames.some((d) => dayName.includes(d))) {
              const meals = [];
              let next = el.nextElementSibling;
              while (next && next.tagName !== 'H4' && next.tagName !== 'H3') {
                if (next.tagName === 'P') {
                  const bold = next.querySelector('b');
                  const mealType = bold ? bold.textContent.replace(/:\s*$/, '').trim() : '';
                  const rest = (next.textContent || '').replace(bold?.textContent || '', '').replace(/^:\s*/, '').trim();
                  const isMeal = mealTypes.some((m) => norm(mealType).includes(norm(m)));
                  if (isMeal && (mealType || rest)) meals.push({ type: mealType || 'Jídlo', text: rest, fullHtml: next.innerHTML });
                }
                next = next.nextElementSibling;
              }
              result.days.push({ dayName, meals });
            }
          }
          el = el.tagName === 'H3' ? null : el.nextElementSibling;
        }
      } else if (/Recepty/i.test(title)) {
        const dayNames = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
        let el = h3.nextElementSibling;
        while (el && el.tagName !== 'H3') {
          if (el.tagName === 'H4') {
            const name = (el.textContent || '').trim();
            if (!dayNames.some((d) => name.includes(d))) {
              let next = el.nextElementSibling;
              let content = '';
              while (next && next.tagName !== 'H4' && next.tagName !== 'H3') {
                content += next.outerHTML;
                next = next.nextElementSibling;
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
        while (el && el.tagName !== 'H3') {
          if (el.tagName === 'P') {
            result.mindsetTip = (el.textContent || '').trim();
            break;
          }
          el = el.nextElementSibling;
        }
      }
    });

    // Doplnění chybějících dnů (AI někdy vynechá Sobotu) – vždy zobrazit 7 dní
    const dayOrder = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
    if (result.days.length > 0 && result.days.length < 7) {
      const byDay = {};
      result.days.forEach((d) => {
        const match = dayOrder.find((dn) => (d.dayName || '').includes(dn));
        if (match) byDay[match] = d;
      });
      result.days = dayOrder.map((dn) => byDay[dn] || { dayName: dn, meals: [], _placeholder: true });
    }

    if (result.personal.length || result.macros.length || result.days.length) return result;
    return null;
  } catch (e) {
    return null;
  }
}

export { parsePlanHtml };
export default function PlanViewer({ plan, userName, hideHero }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [recipeModal, setRecipeModal] = useState(null); // { title, content, anchorRect, hasRecipe, openId? }
  const [mealOverrides, setMealOverrides] = useState({}); // { "di_mi": { title, content } }
  const [swapModal, setSwapModal] = useState(null); // { dayIndex, mealIndex, dishQuery, loading, html }
  const [shoppingCopyDone, setShoppingCopyDone] = useState(false);
  const [shoppingSendEmail, setShoppingSendEmail] = useState({ loading: false, done: false, error: null });
  const recipeOpenIdRef = useRef(0);
  const recipeCacheRef = useRef(new Map()); // dish -> html, 5 min TTL

  const getRecipeForDish = (dishName) => {
    const key = (dishName || '').trim().toLowerCase().slice(0, 120);
    if (!key) return Promise.resolve(null);
    const cached = recipeCacheRef.current.get(key);
    if (cached && cached.html != null && Date.now() - (cached.at || 0) < 5 * 60 * 1000) return Promise.resolve(cached.html);
    return fetch('/api/recipe?dish=' + encodeURIComponent((dishName || '').trim().slice(0, 150)))
      .then((res) => res.json())
      .then((data) => {
        const html = data.ok && data.html ? data.html : null;
        recipeCacheRef.current.set(key, { html, at: Date.now() });
        return html;
      })
      .catch(() => null);
  };

  useEffect(() => {
    if (plan?.plan_html && typeof document !== 'undefined') {
      setParsed(parsePlanHtml(plan.plan_html));
    } else {
      setParsed(null);
    }
  }, [plan?.plan_html]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (recipeModal || swapModal) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [recipeModal, swapModal]);

  if (!plan || !plan.plan_html) {
    return (
      <section className="card plan-section">
        <h2>Můj plán</h2>
        <p className="empty-plan">
          Zatím nemáš žádný plán. Vyplň dotazník na <a href="/start">stránce START</a> a dostaneš osobní plán na míru.
        </p>
        <style jsx>{planSectionStyles}</style>
      </section>
    );
  }

  const today = new Date();
  const todayStr = today.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  const isValid = plan.valid_until ? new Date(plan.valid_until) >= today : true;
  const showGraphical = parsed && (parsed.personal?.length > 0 || parsed.days?.length > 0);

  return (
    <section className="card plan-section plan-section-premium">
      {/* Hero nadpis (lze skrýt, když je vykreslen nahoře na stránce) */}
      {!hideHero && (
        <div className="plan-hero">
          <h2 className="plan-hero-title">Tvůj osobní AI plán Body & Mind ON</h2>
          {plan.plan_type && <span className="plan-badge">{plan.plan_type}</span>}
        </div>
      )}

      {!isValid && (
        <p className="plan-expired">
          ⚠️ Tento plán již vypršel. Vygeneruj si nový plán.
        </p>
      )}

      {showGraphical ? (
        <>
          {/* Osobní údaje & cíle – karty s ikonami */}
          {parsed.personal?.length > 0 && (
            <div className="plan-block">
              <h3 className="plan-block-title">Osobní údaje & cíle</h3>
              <div className="plan-cards-grid">
                {parsed.personal.map((item, i) => (
                  <div key={i} className="plan-card" style={{ animationDelay: `${i * 0.05}s` }}>
                    <span className="plan-card-icon">{PERSONAL_ICONS[item.label] || '📋'}</span>
                    <span className="plan-card-label">{item.label}</span>
                    <span className="plan-card-value">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Denní cíle – makra */}
          {parsed.macros?.length > 0 && (
            <div className="plan-block">
              <h3 className="plan-block-title">Denní cíle</h3>
              <div className="plan-macros-row">
                {parsed.macros.map((m, i) => (
                  <div key={i} className="plan-macro-card">
                    <span className="plan-macro-value">{m.value}</span>
                    <span className="plan-macro-label">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dnes banner */}
          <div className="plan-today-banner">
            <span className="plan-today-emoji">📅</span>
            <div>
              <h3>Dnes ({todayStr})</h3>
              <p>Podívej se do jídelníčku a tréninku níže.</p>
            </div>
          </div>

          {/* Export jídelníčku – PDF s češtinou a obrázky */}
          {parsed.days?.length > 0 && (
            <div className="plan-block plan-export-row">
              <button
                type="button"
                className="plan-export-btn"
                onClick={() => {
                  let rows = '';
                  (parsed.days || []).forEach((day, di) => {
                    rows += `<div class="day-block"><div class="day-name">${(day.dayName || 'Den').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`;
                    (day.meals || []).forEach((meal, mi) => {
                      const key = `${di}_${mi}`;
                      const ov = mealOverrides[key];
                      const text = ov ? ov.title : (meal.text || meal.fullHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                      const dishTitle = (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                      const imgUrl = getMealImageByDish(text);
                      rows += `<div class="meal-row"><img src="${imgUrl}" class="meal-img" /><div class="meal-info"><div class="meal-type">${(meal.type || 'Jídlo').replace(/</g, '&lt;')}</div><div class="meal-title">${dishTitle}</div></div></div>`;
                    });
                    rows += `</div>`;
                  });

                  const html = `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8"><title>Jídelníček – Body & Mind ON</title><style>
                    *{box-sizing:border-box;margin:0;padding:0}
                    body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;background:#fff;padding:20px}
                    h1{font-size:20px;font-weight:700;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #e2e8f0;color:#0f172a}
                    .day-block{margin-bottom:18px;break-inside:avoid}
                    .day-name{font-size:14px;font-weight:700;background:#eff6ff;color:#1e40af;padding:6px 12px;border-radius:6px;margin-bottom:8px}
                    .meal-row{display:flex;gap:12px;align-items:center;margin-bottom:6px;background:#f8fafc;border-radius:8px;padding:8px}
                    .meal-img{width:80px;height:56px;object-fit:cover;border-radius:6px;flex-shrink:0}
                    .meal-type{font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:0.04em;margin-bottom:2px}
                    .meal-title{font-size:12px;color:#1e293b;line-height:1.4}
                    @media print{body{padding:10px}.day-block{break-inside:avoid}}
                  </style></head><body>
                    <h1>Jídelníček na týden – Body &amp; Mind ON</h1>
                    ${rows}
                    <script>window.onload=function(){window.print()}<\/script>
                  </body></html>`;

                  const w = window.open('', '_blank', 'width=900,height=700');
                  if (w) { w.document.write(html); w.document.close(); }
                }}
              >
                Stáhnout jídelníček (PDF)
              </button>
            </div>
          )}

          {/* Jídelníček – dny a jídla s obrázky */}
          {parsed.days?.length > 0 && (
            <div className="plan-block">
              <h3 className="plan-block-title">Jídelníček na celý týden</h3>
              <div className="plan-days">
                {parsed.days.map((day, di) => (
                  <div key={di} className={`plan-day-card ${day._placeholder ? 'plan-day-placeholder' : ''}`}>
                    <h4 className="plan-day-name">{day.dayName}</h4>
                    <div className="plan-meals">
                      {day._placeholder && day.meals.length === 0 ? (
                        <p className="plan-day-placeholder-msg">V plánu chybí – vygeneruj nový plán pro kompletní jídelníček.</p>
                      ) : null}
                      {day.meals.map((meal, mi) => {
                        const overrideKey = `${di}_${mi}`;
                        const override = mealOverrides[overrideKey];
                        const mealFullText = override ? `${meal.type || ''} ${override.title || ''}`.trim() : `${meal.type || ''} ${meal.text || ''}`.trim();
                        const mealStart = mealFullText.replace(/\s*\(.*$/, '').trim().slice(0, 35);
                        const matchingRecipe = !override && parsed.recipes?.find((r) => {
                          const rn = r.name.toLowerCase();
                          const mt = mealFullText.toLowerCase();
                          if (mt.includes(rn)) return true;
                          const startWords = mealStart.toLowerCase().split(/\s+/).slice(0, 4).join(' ');
                          if (startWords.length >= 5 && rn.includes(startWords)) return true;
                          return false;
                        });
                        const dishTitle = (meal.text || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
                        const modalTitle = (meal.type && dishTitle) ? `${meal.type}: ${dishTitle}` : dishTitle || meal.type || mealFullText || 'Jídlo';
                        const openRecipe = (e) => {
                          if (override?.content) {
                            const button = e?.currentTarget;
                            const rect = button?.getBoundingClientRect?.();
                            const anchorRect = rect ? { top: rect.bottom + 8, left: rect.left, width: rect.width } : null;
                            recipeOpenIdRef.current += 1;
                            setRecipeModal({ openId: recipeOpenIdRef.current, title: override.title || modalTitle, content: recipeContentOnly(override.content), anchorRect, hasRecipe: true, loading: false });
                            return;
                          }
                          const button = e?.currentTarget;
                          const rect = button?.getBoundingClientRect?.();
                          const anchorRect = rect ? { top: rect.bottom + 8, left: rect.left, width: rect.width } : null;
                          recipeOpenIdRef.current += 1;
                          const thisOpenId = recipeOpenIdRef.current;
                          const hasRealRecipe = matchingRecipe?.content && !/lorem\s+ipsum|dolor\s+sit\s+amet/i.test(matchingRecipe.content);
                          if (hasRealRecipe) {
                            setRecipeModal({ openId: thisOpenId, title: matchingRecipe.name || modalTitle, content: recipeContentOnly(matchingRecipe.content), anchorRect, hasRecipe: true, loading: false });
                            return;
                          }
                          const dishName = (mealFullText.replace(/\s*\([^)]*\)\s*$/g, '').trim() || meal.type || 'Jídlo').slice(0, 150);
                          setRecipeModal({ openId: thisOpenId, title: modalTitle, content: null, anchorRect, hasRecipe: false, loading: true });
                          getRecipeForDish(dishName).then((html) => {
                            const fallback = '<p class="plan-no-recipe-msg">Recept se nepodařilo načíst. Zkontroluj připojení nebo zkus znovu.</p>';
                            setRecipeModal((prev) => (prev && prev.openId === thisOpenId ? { ...prev, content: html || fallback, loading: false } : prev));
                          });
                        };
                        const handleSwap = () => {
                          const dishQuery = `${meal.type || 'Jídlo'} alternativa, do 500 kcal`.slice(0, 150);
                          setSwapModal({ dayIndex: di, mealIndex: mi, dishQuery, loading: true, html: null });
                          getRecipeForDish(dishQuery).then((html) => {
                            setSwapModal((prev) => prev ? { ...prev, loading: false, html: html || '' } : null);
                          });
                        };
                        return (
                          <div key={mi} className="plan-meal-card">
                            <button type="button" className="plan-meal-image-wrap" onClick={openRecipe} title="Klikni pro zobrazení receptu">
                              <img
                                src={getMealImageByDish(mealFullText || meal.text || meal.type)}
                                alt=""
                                className="plan-meal-image"
                                onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_MEAL_IMAGE; }}
                              />
                              <span className="plan-meal-type">{meal.type}</span>
                              <span className="plan-meal-recept-badge">Klikni pro recept</span>
                            </button>
                            <div className="plan-meal-body">
                              <p className="plan-meal-text">
                                {override ? (override.title || 'Náhrada') : <span dangerouslySetInnerHTML={{ __html: meal.text || meal.fullHtml }} />}
                              </p>
                              <button type="button" className="plan-meal-swap" onClick={(e) => { e.stopPropagation(); handleSwap(); }}>Nahradit jiným</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modal receptu – vykreslen v portálu do body, aby byl u kliknutého jídla (fixed vůči viewportu) */}
          {recipeModal && typeof document !== 'undefined' && createPortal(
            <div className="plan-recipe-modal-overlay" onClick={() => setRecipeModal(null)}>
              <div
                className="plan-recipe-modal plan-recipe-modal-dynamic"
                onClick={(e) => e.stopPropagation()}
                style={(() => {
                  const pad = 16;
                  const maxW = 520;
                  const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
                  const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
                  const maxH = vh - pad * 2;
                  if (recipeModal.anchorRect && typeof window !== 'undefined') {
                    const top = recipeModal.anchorRect.top;
                    const left = recipeModal.anchorRect.left;
                    const topClamped = Math.max(pad, Math.min(top, vh - maxH - pad));
                    return {
                      position: 'fixed',
                      top: `${topClamped}px`,
                      left: `${Math.max(pad, Math.min(left, vw - maxW - pad))}px`,
                      height: `${maxH}px`,
                      maxHeight: `${maxH}px`,
                      width: 'min(520px, calc(100vw - 24px))',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                    };
                  }
                  return {
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    height: `${maxH}px`,
                    maxHeight: `${maxH}px`,
                    width: 'min(520px, calc(100vw - 24px))',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  };
                })()}
              >
                <div className="plan-recipe-modal-header">
                  <h3>{recipeModal.hasRecipe ? `Recept: ${recipeModal.title}` : recipeModal.title}</h3>
                  <button type="button" className="plan-recipe-modal-close" onClick={() => setRecipeModal(null)} aria-label="Zavřít">×</button>
                </div>
                {recipeModal.loading ? (
                  <div className="plan-recipe-modal-loading">
                    <span className="plan-recipe-modal-spinner" />
                    <p>Načítám recept z internetu…</p>
                  </div>
                ) : (
                  <div className="plan-recipe-modal-body" dangerouslySetInnerHTML={{ __html: recipeModal.content || '' }} />
                )}
              </div>
            </div>,
            document.body
          )}

          {/* Swap modal – alternativa jídla */}
          {swapModal && typeof document !== 'undefined' && createPortal(
            <div className="plan-recipe-modal-overlay" onClick={() => setSwapModal(null)}>
              <div className="plan-recipe-modal plan-recipe-modal-dynamic" onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(520px, calc(100vw - 24px))', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#1a1a2e', borderRadius: '16px', border: '1px solid #333', zIndex: 10001 }}>
                <div className="plan-recipe-modal-header">
                  <h3>Alternativa: {swapModal.dishQuery}</h3>
                  <button type="button" className="plan-recipe-modal-close" onClick={() => setSwapModal(null)} aria-label="Zavřít">×</button>
                </div>
                {swapModal.loading ? (
                  <div className="plan-recipe-modal-loading">
                    <span className="plan-recipe-modal-spinner" />
                    <p>Generuji alternativu…</p>
                  </div>
                ) : (
                  <>
                    <div className="plan-recipe-modal-body" dangerouslySetInnerHTML={{ __html: swapModal.html || '<p>Recept se nepodařilo načíst.</p>' }} />
                    <div className="plan-recipe-modal-actions">
                      <button type="button" className="plan-recipe-modal-replace-btn" onClick={() => {
                        setMealOverrides((o) => ({ ...o, [`${swapModal.dayIndex}_${swapModal.mealIndex}`]: { title: swapModal.dishQuery, content: swapModal.html } }));
                        setSwapModal(null);
                      }}>
                        Nahradit toto jídlo v plánu
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body
          )}

          {/* Mindset se vykresluje v profil.js hned pod Tvé milníky */}

          {/* Nákupní seznam na týden (z plánu nebo fallback z receptů) */}
          {(() => {
            const list = parsed.shoppingList?.length ? parsed.shoppingList : buildShoppingListFromRecipes(parsed.recipes);
            const copyAndOpen = () => {
              const text = list.join('\n');
              if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                  setShoppingCopyDone(true);
                  setTimeout(() => setShoppingCopyDone(false), 3000);
                });
              }
              window.open('https://www.rohlik.cz/', '_blank', 'noopener,noreferrer');
            };
            const handleSendEmail = async () => {
              setShoppingSendEmail({ loading: true, done: false, error: null });
              try {
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token;
                if (!token) {
                  setShoppingSendEmail({ loading: false, done: false, error: 'Pro odeslání e-mailem se přihlas.' });
                  return;
                }
                const res = await fetch('/api/send-shopping-list', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ items: list }),
                });
                const data = await res.json();
                if (!res.ok) {
                  setShoppingSendEmail({ loading: false, done: false, error: data.error || 'Nepodařilo odeslat.' });
                  return;
                }
                setShoppingSendEmail({ loading: false, done: true, error: null });
                setTimeout(() => setShoppingSendEmail((s) => ({ ...s, done: false })), 4000);
              } catch (e) {
                setShoppingSendEmail({ loading: false, done: false, error: 'Chyba připojení.' });
              }
            };
            const handleShareWhatsApp = () => {
              const text = list.join('\n');
              const url = `https://wa.me/?text=${encodeURIComponent('🛒 Nákupní seznam Body & Mind ON:\n\n' + text)}`;
              window.open(url, '_blank', 'noopener,noreferrer');
            };
            return list.length > 0 ? (
              <div className="plan-block">
                <h3 className="plan-block-title">Nákupní seznam na týden</h3>
                <ul className="plan-shopping-list">
                  {list.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
                <div className="plan-order-ingredients">
                  <div className="plan-shopping-actions">
                    <button type="button" className="plan-btn-order" onClick={copyAndOpen}>
                      🛒 Objednat suroviny
                    </button>
                    <button type="button" className="plan-btn-share" onClick={handleSendEmail} disabled={shoppingSendEmail.loading}>
                      {shoppingSendEmail.loading ? 'Odesílám…' : '✉️ Poslat e-mailem'}
                    </button>
                    <button type="button" className="plan-btn-share" onClick={handleShareWhatsApp}>
                      📱 Sdílet WhatsApp
                    </button>
                  </div>
                  {shoppingCopyDone && <span className="plan-copy-hint">Seznam zkopírován do schránky</span>}
                  {shoppingSendEmail.done && <span className="plan-copy-hint plan-copy-success">Odesláno na e-mail</span>}
                  {shoppingSendEmail.error && <span className="plan-copy-hint plan-copy-error">{shoppingSendEmail.error}</span>}
                  <p className="plan-order-links">
                    Seznam se zkopíruje a otevře se <a href="https://www.rohlik.cz/" target="_blank" rel="noopener noreferrer">Rohlík.cz</a>.
                    Můžeš ho vložit v nákupním seznamu (Ctrl+V). Případně nákup vyřídíš na{' '}
                    <a href="https://www.kosik.cz/" target="_blank" rel="noopener noreferrer">Košík.cz</a> nebo{' '}
                    <a href="https://shop.billa.cz/" target="_blank" rel="noopener noreferrer">Billa e-shop</a>.
                  </p>
                </div>
              </div>
            ) : null;
          })()}

          {/* Trénink + Regenerace – zbytek v rozbalovacím celém plánu */}
          <div className="plan-expandable">
            <button type="button" className="plan-toggle" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? '▼ Skrýt celý plán (trénink, regenerace, původní text)' : '▶ Zobrazit celý plán'}
            </button>
            {isExpanded && (
              <div className="plan-full-content" dangerouslySetInnerHTML={{ __html: plan.plan_html }} />
            )}
          </div>
        </>
      ) : (
        <>
          <div className="plan-today-banner">
            <span className="plan-today-emoji">📅</span>
            <div>
              <h3>Dnes ({todayStr})</h3>
              <p>Podívej se do svého plánu níže.</p>
            </div>
          </div>
          <div className="plan-expandable">
            <button type="button" className="plan-toggle" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? '▼ Skrýt celý plán' : '▶ Zobrazit celý plán'}
            </button>
            {isExpanded && (
              <div className="plan-full-content" dangerouslySetInnerHTML={{ __html: plan.plan_html }} />
            )}
          </div>
        </>
      )}

      <style jsx>{planSectionStyles}</style>
    </section>
  );
}

const planSectionStyles = `
  .plan-section {
    margin-bottom: 40px;
  }
  .plan-section-premium {
    overflow: hidden;
  }

  .plan-hero {
    text-align: center;
    padding: 28px 24px 32px;
    margin: -24px -24px 24px -24px;
    background: linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4c1d95 100%);
    border-radius: 20px 20px 0 0;
    position: relative;
  }
  .plan-hero::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(167, 139, 250, 0.5), transparent);
  }
  .plan-hero-title {
    margin: 0 0 12px;
    font-size: 22px;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 2px 20px rgba(0,0,0,0.2);
  }
  .plan-badge {
    display: inline-block;
    background: rgba(255,255,255,0.25);
    color: #e9d5ff;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .plan-expired {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #f87171;
    padding: 12px 16px;
    border-radius: 12px;
    margin-bottom: 20px;
    font-size: 14px;
  }

  .plan-block {
    margin-bottom: 32px;
  }
  .plan-block-title {
    font-size: 18px;
    font-weight: 600;
    color: #e9d5ff;
    margin: 0 0 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(139, 92, 255, 0.3);
  }
  .plan-mindset-block { background: rgba(139, 92, 255, 0.08); border-radius: 12px; padding: 16px; }
  .plan-mindset-text { margin: 0; color: #e9d5ff; line-height: 1.5; }
  .plan-shopping-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .plan-shopping-list li {
    padding: 6px 10px;
    background: rgba(255,255,255,0.06);
    border-radius: 8px;
    color: #e9d5ff;
  }
  .plan-order-ingredients {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid rgba(139, 92, 255, 0.25);
  }
  .plan-shopping-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-bottom: 8px;
  }
  .plan-btn-order {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: linear-gradient(135deg, #7c3aed, #6366f1);
    color: #fff;
    border: none;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .plan-btn-order:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(124, 58, 237, 0.4);
  }
  .plan-btn-share {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    background: rgba(139, 92, 255, 0.25);
    color: #e9d5ff;
    border: 1px solid rgba(139, 92, 255, 0.4);
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, transform 0.15s;
  }
  .plan-btn-share:hover:not(:disabled) {
    background: rgba(139, 92, 255, 0.35);
    transform: translateY(-1px);
  }
  .plan-btn-share:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  .plan-copy-hint {
    display: inline-block;
    margin-left: 12px;
    font-size: 13px;
    color: #86efac;
  }
  .plan-copy-success { color: #86efac !important; }
  .plan-copy-error { color: #f87171 !important; }
  .plan-order-links {
    margin: 12px 0 0;
    font-size: 13px;
    color: rgba(233, 213, 255, 0.85);
    line-height: 1.5;
  }
  .plan-order-links a {
    color: #a78bfa;
    text-decoration: none;
  }
  .plan-order-links a:hover {
    text-decoration: underline;
  }

  .plan-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
  }
  .plan-card {
    background: linear-gradient(145deg, rgba(139, 92, 255, 0.12), rgba(99, 102, 241, 0.08));
    border: 1px solid rgba(139, 92, 255, 0.25);
    border-radius: 14px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    animation: planFadeIn 0.4s ease-out backwards;
  }
  .plan-card-icon {
    font-size: 24px;
    margin-bottom: 4px;
  }
  .plan-card-label {
    font-size: 11px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .plan-card-value {
    font-size: 14px;
    font-weight: 600;
    color: #e9d5ff;
    text-align: center;
  }

  .plan-macros-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .plan-macro-card {
    flex: 1;
    min-width: 80px;
    background: rgba(0,0,0,0.2);
    border-radius: 12px;
    padding: 16px;
    text-align: center;
    border: 1px solid rgba(255,255,255,0.06);
  }
  .plan-macro-value {
    display: block;
    font-size: 20px;
    font-weight: 700;
    color: #a78bfa;
  }
  .plan-macro-label {
    font-size: 12px;
    color: #64748b;
  }

  .plan-today-banner {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    background: linear-gradient(135deg, rgba(155, 92, 255, 0.18), rgba(14, 165, 233, 0.12));
    border: 1px solid rgba(155, 92, 255, 0.35);
    border-radius: 16px;
    padding: 20px;
    margin-bottom: 28px;
  }
  .plan-today-emoji {
    font-size: 32px;
    line-height: 1;
  }
  .plan-today-banner h3 {
    margin: 0 0 6px;
    font-size: 18px;
    color: #fff;
  }
  .plan-today-banner p {
    margin: 0;
    color: #cbd5e1;
    font-size: 14px;
  }

  .plan-days {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .plan-day-card {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    overflow: hidden;
  }
  .plan-day-placeholder {
    border-style: dashed;
    opacity: 0.85;
  }
  .plan-day-placeholder-msg {
    grid-column: 1 / -1;
    padding: 24px 16px;
    color: #94a3b8;
    font-size: 14px;
    text-align: center;
    margin: 0;
  }
  .plan-day-name {
    margin: 0;
    padding: 14px 18px;
    font-size: 16px;
    font-weight: 600;
    color: #c4b5fd;
    background: rgba(139, 92, 255, 0.1);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .plan-meals {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
    padding: 16px;
  }
  .plan-meal-card {
    background: rgba(0,0,0,0.15);
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.05);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .plan-meal-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  }
  .plan-meal-image-wrap {
    position: relative;
    height: 140px;
    overflow: hidden;
    display: block;
    width: 100%;
    border: none;
    padding: 0;
    background: none;
    cursor: pointer;
    text-align: left;
  }
  .plan-meal-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .plan-meal-type {
    position: absolute;
    top: 10px;
    left: 10px;
    background: rgba(0,0,0,0.7);
    color: #e9d5ff;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
  }
  .plan-meal-recept-badge {
    position: absolute;
    bottom: 10px;
    right: 10px;
    background: rgba(139, 92, 255, 0.9);
    color: #fff;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
  }
  .plan-recipe-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.75);
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    z-index: 1000;
    padding: 12px;
    box-sizing: border-box;
  }
  .plan-recipe-modal {
    background: linear-gradient(180deg, #1e1b4b 0%, #0f0f1a 100%);
    border: 1px solid rgba(139, 92, 255, 0.4);
    border-radius: 20px;
    max-width: 520px;
    width: 100%;
    max-height: 85vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 48px rgba(0,0,0,0.5);
  }
  .plan-recipe-modal-dynamic {
    align-self: stretch;
  }
  .plan-recipe-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }
  .plan-recipe-modal-header h3 {
    margin: 0;
    font-size: 18px;
    color: #e9d5ff;
  }
  .plan-recipe-modal-close {
    background: rgba(255,255,255,0.1);
    border: none;
    color: #fff;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
  }
  .plan-recipe-modal-close:hover {
    background: rgba(239, 68, 68, 0.3);
  }
  .plan-recipe-modal-loading {
    padding: 40px 20px;
    text-align: center;
    color: #94a3b8;
  }
  .plan-recipe-modal-spinner {
    display: inline-block;
    width: 32px;
    height: 32px;
    border: 3px solid rgba(139, 92, 255, 0.3);
    border-top-color: #9b5cff;
    border-radius: 50%;
    animation: plan-spin 0.8s linear infinite;
  }
  .plan-recipe-modal-loading p {
    margin: 16px 0 0;
    font-size: 14px;
  }
  @keyframes plan-spin {
    to { transform: rotate(360deg); }
  }
  .plan-recipe-modal-body {
    padding: 20px;
    overflow-y: auto;
    overflow-x: hidden;
    flex: 1 1 auto;
    min-height: 0;
    font-size: 14px;
    color: #cbd5e1;
    line-height: 1.6;
    -webkit-overflow-scrolling: touch;
  }
  .plan-recipe-modal-body :global(p) { margin: 10px 0; }
  .plan-recipe-modal-body :global(b) { color: #e9d5ff; }
  .plan-recipe-modal-body :global(ul) { margin: 10px 0; padding-left: 20px; }
  .plan-recipe-modal-body :global(.plan-no-recipe-msg) {
    color: #fbbf24;
    font-weight: 600;
    margin-bottom: 12px;
  }
  .plan-recipe-modal-body :global(.plan-no-recipe-hint) {
    color: #94a3b8;
    font-size: 13px;
  }
  .plan-meal-body {
    padding: 14px;
    position: relative;
  }
  .plan-meal-text {
    margin: 0 0 8px;
    font-size: 13px;
    color: #cbd5e1;
    line-height: 1.5;
  }
  .plan-meal-text :global(b) {
    color: #e9d5ff;
  }
  .plan-meal-swap {
    font-size: 11px;
    color: #94a3b8;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px;
    padding: 4px 10px;
    cursor: pointer;
  }
  .plan-meal-swap:hover { color: #c4b5fd; border-color: rgba(139, 92, 255, 0.5); }
  .plan-export-row { padding-top: 0; }
  .plan-export-btn {
    padding: 10px 18px;
    background: rgba(139, 92, 255, 0.2);
    border: 1px solid rgba(139, 92, 255, 0.4);
    border-radius: 12px;
    color: #e9d5ff;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }
  .plan-export-btn:hover { background: rgba(139, 92, 255, 0.3); }
  .plan-recipe-modal-actions { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.08); }
  .plan-recipe-modal-replace-btn {
    width: 100%;
    padding: 12px 16px;
    background: linear-gradient(135deg, #7c3aed, #9b5cff);
    border: none;
    border-radius: 10px;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
  }
  .plan-recipe-modal-replace-btn:hover { opacity: 0.95; }

  .plan-recipe-links {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .plan-recipe-links li { margin: 0; }
  .plan-recipe-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 12px 16px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    color: #c4b5fd;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .plan-recipe-link:hover {
    background: rgba(139, 92, 255, 0.15);
    border-color: rgba(139, 92, 255, 0.3);
  }
  .plan-recipe-link span:last-child {
    opacity: 0.7;
    font-size: 18px;
  }

  .plan-recipe-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    overflow: hidden;
  }
  .plan-recipe-card summary {
    padding: 14px 18px;
    font-weight: 600;
    color: #c4b5fd;
    cursor: pointer;
    list-style: none;
  }
  .plan-recipe-card summary::-webkit-details-marker { display: none; }
  .plan-recipe-card summary::after {
    content: ' ▶';
    font-size: 12px;
    color: #64748b;
  }
  .plan-recipe-card[open] summary::after { content: ' ▼'; }
  .plan-recipe-body {
    padding: 0 18px 18px;
    font-size: 14px;
    color: #94a3b8;
    line-height: 1.6;
  }
  .plan-recipe-body :global(p) { margin: 8px 0; }
  .plan-recipe-body :global(b) { color: #e9d5ff; }

  .plan-expandable {
    margin-top: 24px;
  }
  .plan-toggle {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #a78bfa;
    padding: 14px 20px;
    border-radius: 12px;
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
    width: 100%;
    transition: all 0.2s;
  }
  .plan-toggle:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: #9b5cff;
  }
  .plan-full-content {
    margin-top: 16px;
    padding: 24px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    color: #cbd5e1;
    line-height: 1.7;
  }
  .plan-full-content :global(h2) { color: #fff; font-size: 22px; margin: 0 0 16px; }
  .plan-full-content :global(h3) { color: #e9d5ff; font-size: 17px; margin: 20px 0 10px; }
  .plan-full-content :global(h4) { color: #c4b5fd; font-size: 15px; margin: 14px 0 8px; }
  .plan-full-content :global(p) { margin: 8px 0; color: #cbd5e1; }
  .plan-full-content :global(ul), .plan-full-content :global(ol) { margin: 12px 0; padding-left: 24px; }
  .plan-full-content :global(li) { margin: 6px 0; color: #cbd5e1; }
  .plan-full-content :global(b) { color: #e9d5ff; }

  .plan-macros { margin-bottom: 24px; }
  .plan-macros h3 { font-size: 18px; margin-bottom: 12px; color: #e9d5ff; }
  .plan-macros-content {
    background: rgba(255, 255, 255, 0.03);
    padding: 16px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .empty-plan {
    color: #94a3b8;
    text-align: center;
    padding: 20px;
  }
  .empty-plan a {
    color: #a78bfa;
    text-decoration: underline;
  }

  @keyframes planFadeIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 640px) {
    .plan-hero { padding: 20px 16px 24px; margin-left: -16px; margin-right: -16px; }
    .plan-hero-title { font-size: 18px; }
    .plan-cards-grid { grid-template-columns: repeat(2, 1fr); }
    .plan-meals { grid-template-columns: 1fr; }
  }
`;
