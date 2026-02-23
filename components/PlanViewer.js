// /components/PlanViewer.js – Grafické zobrazení AI plánu (wow efekt, obrázky u jídel)
import { useState, useEffect } from 'react';

// Obrázky podle konkrétního jídla (klíčová slova v názvu/popisu) – každé jídlo jiný obrázek
const DISH_IMAGES = [
  { keys: ['ovesná kaše', 'oatmeal', 'ovesné'], url: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400&h=280&fit=crop' },
  { keys: ['jogurt', 'granola', 'müsli'], url: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=280&fit=crop' },
  { keys: ['vajíčk', 'omelet', 'vejce'], url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=280&fit=crop' },
  { keys: ['smoothie', 'koktejl'], url: 'https://images.unsplash.com/photo-1505252585461-04db1ebd3c2c?w=400&h=280&fit=crop' },
  { keys: ['kuřecí', 'chicken', 'prsa'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['tofu', 'stir-fry', 'wok'], url: 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?w=400&h=280&fit=crop' },
  { keys: ['losos', 'salmon', 'ryb'], url: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&h=280&fit=crop' },
  { keys: ['steak', 'hovězí', 'beef'], url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=280&fit=crop' },
  { keys: ['quinoa', 'bulgur', 'couscous'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['salát', 'salad', 'zelenin'], url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop' },
  { keys: ['polévka', 'soup'], url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=280&fit=crop' },
  { keys: ['špenát', 'spinach', 'listová'], url: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400&h=280&fit=crop' },
  { keys: ['brambor', 'brambory'], url: 'https://images.unsplash.com/photo-1518013431117-eb2895b37a9d?w=400&h=280&fit=crop' },
  { keys: ['těstovin', 'pasta', 'špagety'], url: 'https://images.unsplash.com/photo-1551183053-bf91a1f81115?w=400&h=280&fit=crop' },
  { keys: ['rýže', 'rice'], url: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=280&fit=crop' },
  { keys: ['večeře', 'večere'], url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=280&fit=crop' },
  { keys: ['oběd', 'obed'], url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=280&fit=crop' },
  { keys: ['snídaně', 'snidane'], url: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400&h=280&fit=crop' },
  { keys: ['svačina'], url: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=280&fit=crop' },
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

function getMealImageByDish(mealText) {
  if (!mealText || typeof mealText !== 'string') return DEFAULT_MEAL_IMAGE;
  const lower = mealText.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  for (const { keys, url } of DISH_IMAGES) {
    if (keys.some((k) => lower.includes(k.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')))) return url;
  }
  return DEFAULT_MEAL_IMAGE;
}

function parsePlanHtml(html) {
  if (!html || typeof document === 'undefined') return null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const result = { personal: [], macros: [], days: [], recipes: [], workout: '', regeneration: [], rawSections: {} };

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
        let el = h3.nextElementSibling;
        while (el) {
          if (el.tagName === 'H4') {
            const dayName = (el.textContent || '').trim();
            if (dayNames.some((d) => dayName.includes(d))) {
              const meals = [];
              let next = el.nextElementSibling;
              while (next && next.tagName !== 'H4') {
                if (next.tagName === 'P') {
                  const bold = next.querySelector('b');
                  const mealType = bold ? bold.textContent.replace(/:\s*$/, '').trim() : '';
                  const rest = (next.textContent || '').replace(bold?.textContent || '', '').replace(/^:\s*/, '').trim();
                  if (mealType || rest) meals.push({ type: mealType || 'Jídlo', text: rest, fullHtml: next.innerHTML });
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
              while (next && next.tagName !== 'H4') {
                content += next.outerHTML;
                next = next.nextElementSibling;
              }
              if (name && content) result.recipes.push({ name, content });
            }
          }
          el = el.nextElementSibling;
        }
      } else if (/Tréninkový plán/i.test(title)) {
        let el = h3.nextElementSibling;
        while (el && el.tagName !== 'H3') {
          result.workout += el.outerHTML || '';
          el = el.nextElementSibling;
        }
      } else if (/Regenerace|Mindset/i.test(title)) {
        result.regeneration = list;
      }
    });

    if (result.personal.length || result.macros.length || result.days.length) return result;
    return null;
  } catch (e) {
    return null;
  }
}

export default function PlanViewer({ plan, userName }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [recipeModal, setRecipeModal] = useState(null); // { title, content } nebo { title, mealHtml }

  useEffect(() => {
    if (plan?.plan_html && typeof document !== 'undefined') {
      setParsed(parsePlanHtml(plan.plan_html));
    } else {
      setParsed(null);
    }
  }, [plan?.plan_html]);

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
      {/* Hero nadpis */}
      <div className="plan-hero">
        <h2 className="plan-hero-title">Tvůj osobní AI plán Body & Mind ON</h2>
        {plan.plan_type && <span className="plan-badge">{plan.plan_type}</span>}
      </div>

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

          {/* Jídelníček – dny a jídla s obrázky */}
          {parsed.days?.length > 0 && (
            <div className="plan-block">
              <h3 className="plan-block-title">Jídelníček na celý týden</h3>
              <div className="plan-days">
                {parsed.days.map((day, di) => (
                  <div key={di} className="plan-day-card">
                    <h4 className="plan-day-name">{day.dayName}</h4>
                    <div className="plan-meals">
                      {day.meals.map((meal, mi) => {
                        const mealFullText = `${meal.type || ''} ${meal.text || ''}`;
                        const matchingRecipe = parsed.recipes?.find((r) => mealFullText.toLowerCase().includes(r.name.toLowerCase()));
                        const openRecipe = () => setRecipeModal(
                          matchingRecipe
                            ? { title: matchingRecipe.name, content: matchingRecipe.content }
                            : { title: meal.type || 'Jídlo', content: meal.fullHtml || meal.text || '' }
                        );
                        return (
                          <div key={mi} className="plan-meal-card">
                            <button type="button" className="plan-meal-image-wrap" onClick={openRecipe} title="Zobrazit recept">
                              <img
                                src={getMealImageByDish(meal.text || meal.type)}
                                alt=""
                                className="plan-meal-image"
                              />
                              <span className="plan-meal-type">{meal.type}</span>
                              <span className="plan-meal-recept-badge">Recept</span>
                            </button>
                            <div className="plan-meal-body">
                              <p className="plan-meal-text" dangerouslySetInnerHTML={{ __html: meal.text || meal.fullHtml }} />
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

          {/* Modal receptu po kliknutí na obrázek */}
          {recipeModal && (
            <div className="plan-recipe-modal-overlay" onClick={() => setRecipeModal(null)}>
              <div className="plan-recipe-modal" onClick={(e) => e.stopPropagation()}>
                <div className="plan-recipe-modal-header">
                  <h3>{recipeModal.title}</h3>
                  <button type="button" className="plan-recipe-modal-close" onClick={() => setRecipeModal(null)} aria-label="Zavřít">×</button>
                </div>
                <div className="plan-recipe-modal-body" dangerouslySetInnerHTML={{ __html: recipeModal.content }} />
              </div>
            </div>
          )}

          {/* Recepty – rozbalovací karty */}
          {parsed.recipes?.length > 0 && (
            <div className="plan-block">
              <h3 className="plan-block-title">Recepty</h3>
              <div className="plan-recipes">
                {parsed.recipes.map((r, i) => (
                  <details key={i} className="plan-recipe-card">
                    <summary>{r.name}</summary>
                    <div className="plan-recipe-body" dangerouslySetInnerHTML={{ __html: r.content }} />
                  </details>
                ))}
              </div>
            </div>
          )}

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
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
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
  .plan-recipe-modal-body {
    padding: 20px;
    overflow-y: auto;
    font-size: 14px;
    color: #cbd5e1;
    line-height: 1.6;
  }
  .plan-recipe-modal-body :global(p) { margin: 10px 0; }
  .plan-recipe-modal-body :global(b) { color: #e9d5ff; }
  .plan-recipe-modal-body :global(ul) { margin: 10px 0; padding-left: 20px; }
  .plan-meal-body {
    padding: 14px;
  }
  .plan-meal-text {
    margin: 0;
    font-size: 13px;
    color: #cbd5e1;
    line-height: 1.5;
  }
  .plan-meal-text :global(b) {
    color: #e9d5ff;
  }

  .plan-recipes {
    display: flex;
    flex-direction: column;
    gap: 10px;
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
