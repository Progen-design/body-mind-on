// /components/PlanViewer.js - Zobrazení AI generovaného plánu
import { useState } from 'react';

export default function PlanViewer({ plan, userName }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!plan || !plan.plan_html) {
    return (
      <section className="card plan-section">
        <h2>Můj plán</h2>
        <p className="empty-plan">
          Zatím nemáš žádný plán. Vyplň dotazník na <a href="/start">stránce START</a> a dostaneš osobní plán na míru.
        </p>
      </section>
    );
  }

  // Parsovat HTML plán a extrahovat důležité informace
  const parsePlan = (html) => {
    if (!html) return null;
    
    // Najít denní cíle (makroživiny)
    const macrosMatch = html.match(/<h3>Denní cíle.*?<\/h3>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);
    const macros = macrosMatch ? macrosMatch[1] : '';
    
    // Najít jídelníček
    const mealsMatch = html.match(/<h3>Jídelníček.*?<\/h3>([\s\S]*?)(?:<h3>|$)/i);
    const meals = mealsMatch ? mealsMatch[1] : '';
    
    // Najít tréninkový plán
    const workoutMatch = html.match(/<h3>Tréninkový plán.*?<\/h3>([\s\S]*?)(?:<h3>|$)/i);
    const workout = workoutMatch ? workoutMatch[1] : '';
    
    return { macros, meals, workout, fullHtml: html };
  };

  const planData = parsePlan(plan.plan_html);
  const today = new Date();
  const todayStr = today.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });

  // Zkontrolovat, zda je plán stále platný
  const isValid = plan.valid_until 
    ? new Date(plan.valid_until) >= today 
    : true;

  return (
    <section className="card plan-section">
      <div className="plan-header">
        <h2>Můj aktuální plán</h2>
        {plan.plan_type && (
          <span className="plan-badge">{plan.plan_type}</span>
        )}
      </div>

      {!isValid && (
        <p className="plan-expired">
          ⚠️ Tento plán již vypršel. Vygeneruj si nový plán.
        </p>
      )}

      {planData && (
        <>
          {/* Denní cíle - vždy viditelné */}
          {planData.macros && (
            <div className="plan-macros">
              <h3>Denní cíle</h3>
              <div 
                className="plan-macros-content"
                dangerouslySetInnerHTML={{ __html: planData.macros }}
              />
            </div>
          )}

          {/* Dnes máš v plánu banner */}
          <div className="plan-today-banner">
            <h3>📅 Dnes ({todayStr})</h3>
            <p>Podívej se do svého plánu níže, co máš dnes v jídelníčku a tréninku.</p>
          </div>

          {/* Rozbalitelný plán */}
          <div className="plan-expandable">
            <button
              className="plan-toggle"
              onClick={() => setIsExpanded(!isExpanded)}
              type="button"
            >
              {isExpanded ? '▼ Skrýt celý plán' : '▶ Zobrazit celý plán'}
            </button>

            {isExpanded && (
              <div 
                className="plan-full-content"
                dangerouslySetInnerHTML={{ __html: plan.plan_html }}
              />
            )}
          </div>
        </>
      )}

      <style jsx>{`
        .plan-section {
          margin-bottom: 40px;
        }

        .plan-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }

        .plan-header h2 {
          margin: 0;
        }

        .plan-badge {
          background: linear-gradient(135deg, #7c3aed, #9b5cff);
          color: #fff;
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
          padding: 12px;
          border-radius: 10px;
          margin-bottom: 20px;
          font-size: 14px;
        }

        .plan-macros {
          margin-bottom: 24px;
        }

        .plan-macros h3 {
          font-size: 18px;
          margin-bottom: 12px;
          color: #e9d5ff;
        }

        .plan-macros-content {
          background: rgba(255, 255, 255, 0.03);
          padding: 16px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .plan-macros-content :global(ul) {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .plan-macros-content :global(li) {
          padding: 8px 0;
          color: #cbd5e1;
          font-size: 14px;
        }

        .plan-macros-content :global(b) {
          color: #e9d5ff;
        }

        .plan-today-banner {
          background: linear-gradient(135deg, rgba(155, 92, 255, 0.2), rgba(14, 165, 233, 0.2));
          border: 1px solid rgba(155, 92, 255, 0.3);
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 24px;
        }

        .plan-today-banner h3 {
          margin: 0 0 8px;
          font-size: 18px;
          color: #fff;
        }

        .plan-today-banner p {
          margin: 0;
          color: #cbd5e1;
          font-size: 14px;
          line-height: 1.6;
        }

        .plan-expandable {
          margin-top: 20px;
        }

        .plan-toggle {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #a78bfa;
          padding: 12px 20px;
          border-radius: 10px;
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
          margin-top: 20px;
          padding: 24px;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          color: #cbd5e1;
          line-height: 1.7;
        }

        .plan-full-content :global(h2) {
          color: #fff;
          font-size: 24px;
          margin: 0 0 20px;
        }

        .plan-full-content :global(h3) {
          color: #e9d5ff;
          font-size: 18px;
          margin: 24px 0 12px;
        }

        .plan-full-content :global(h4) {
          color: #c4b5fd;
          font-size: 16px;
          margin: 16px 0 8px;
        }

        .plan-full-content :global(p) {
          margin: 8px 0;
          color: #cbd5e1;
        }

        .plan-full-content :global(ul),
        .plan-full-content :global(ol) {
          margin: 12px 0;
          padding-left: 24px;
        }

        .plan-full-content :global(li) {
          margin: 6px 0;
          color: #cbd5e1;
        }

        .plan-full-content :global(b) {
          color: #e9d5ff;
          font-weight: 600;
        }

        .plan-full-content :global(section) {
          margin: 20px 0;
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

        @media (max-width: 640px) {
          .plan-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .plan-full-content {
            padding: 16px;
          }
        }
      `}</style>
    </section>
  );
}

