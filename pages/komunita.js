// /pages/komunita.js – Komunita jako chat: zprávy v sekcích, odpovědi pod zprávou (přístup po přihlášení)
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { supabase } from '../lib/supabaseClient';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Komunita() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [fetchError, setFetchError] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  function loadCategories(token) {
    fetch('/api/community/categories', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setCategories(Array.isArray(data.categories) ? data.categories : []))
      .catch(() => setCategories([]));
  }

  function loadTopics(token, catId) {
    const url = catId ? `/api/community?category_id=${encodeURIComponent(catId)}` : '/api/community';
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        setTopics(Array.isArray(data.topics) ? data.topics : []);
        setFetchError(data.error || '');
      })
      .catch(() => { setTopics([]); setFetchError('Nepodařilo se načíst zprávy.'); });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (!s) {
        setLoading(false);
        return;
      }
      loadCategories(s.access_token);
      loadTopics(s.access_token, null);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!loading && !session) router.replace('/login?redirect=/komunita');
  }, [loading, session, router]);

  useEffect(() => {
    if (session?.access_token) loadTopics(session.access_token, selectedCategoryId);
  }, [selectedCategoryId, session?.access_token]);

  async function handleSubmitMessage(e) {
    e.preventDefault();
    if (!session?.access_token || !content.trim()) return;
    setSubmitting(true);
    setSubmitMessage('');
    try {
      const res = await fetch('/api/community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          category_id: selectedCategoryId || null,
          content: content.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitMessage(data.error || 'Odeslání se nepodařilo.');
        return;
      }
      setContent('');
      setSubmitMessage('Zpráva odeslána.');
      setTopics((prev) => [data.topic, ...prev]);
    } catch {
      setSubmitMessage('Odeslání se nepodařilo.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !session) {
    return (
      <>
        <Header />
        <main className="komunita-page"><p className="komunita-loading">Načítám…</p></main>
        <Footer />
      </>
    );
  }
  if (!session) return null;

  return (
    <>
      <Header />
      <main className="komunita-page">
        <div className="komunita-container">
          <h1 className="komunita-title">Fórum komunity</h1>
          <p className="komunita-lead">
            Sekce jako chat – napiš cokoli, ostatní mohou odpovědět. Předávejte si zkušenosti, ptejte se, podporujte se.
          </p>

          {/* Sekce – karty */}
          {categories.length > 0 && (
            <section className="komunita-sections">
              <h2 className="komunita-sections-title">Sekce</h2>
              <p className="komunita-sections-desc">Vyber sekci – uvidíš zprávy v ní a můžeš napsat svoji nebo odpovědět.</p>
              <div className="komunita-sections-grid">
                <button
                  type="button"
                  className={`komunita-section-card ${selectedCategoryId === null ? 'active' : ''}`}
                  onClick={() => setSelectedCategoryId(null)}
                >
                  <span className="komunita-section-icon">📋</span>
                  <span className="komunita-section-name">Všechny zprávy</span>
                  <span className="komunita-section-meta">Všechny zprávy ze všech sekcí</span>
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`komunita-section-card ${selectedCategoryId === cat.id ? 'active' : ''}`}
                    onClick={() => setSelectedCategoryId(cat.id)}
                  >
                    <span className="komunita-section-icon">
                      {cat.slug === 'trenink' ? '🏋️' : cat.slug === 'jidlo-strava' ? '🥗' : cat.slug === 'motivace-progres' ? '📈' : '💬'}
                    </span>
                    <span className="komunita-section-name">{cat.name}</span>
                    <span className="komunita-section-desc">{cat.description || ''}</span>
                    <span className="komunita-section-count">
                      {cat.topic_count ?? 0} {cat.topic_count === 1 ? 'zpráva' : 'zpráv'}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Nový příspěvek – témata jsou sekce nahoře */}
          <section className="komunita-form-card card">
            <h2 className="komunita-form-title">Nový příspěvek</h2>
            <form onSubmit={handleSubmitMessage} className="komunita-form">
              <label className="komunita-label">
                {selectedCategoryId ? `Do sekce ${categories.find((c) => c.id === selectedCategoryId)?.name || ''}` : 'Vyber sekci výše, nebo pošleš do Všechny zprávy'}
                <textarea
                  className="komunita-textarea"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Napiš cokoli – ostatní mohou odpovědět…"
                  rows={3}
                  required
                />
              </label>
              <button type="submit" className="komunita-submit" disabled={submitting}>
                {submitting ? 'Odesílám…' : 'Odeslat'}
              </button>
              {submitMessage && (
                <p className={`komunita-feedback ${submitMessage.includes('nepodařilo') ? 'error' : 'success'}`}>
                  {submitMessage}
                </p>
              )}
            </form>
          </section>

          {/* Feed zpráv */}
          <section className="komunita-list">
            <h2 className="komunita-list-title">
              {selectedCategoryId
                ? categories.find((c) => c.id === selectedCategoryId)?.name || 'Sekce'
                : 'Všechny zprávy'}
            </h2>
            {loading ? (
              <p className="komunita-loading">Načítám…</p>
            ) : fetchError ? (
              <p className="komunita-error">{fetchError}</p>
            ) : topics.length === 0 ? (
              <p className="komunita-empty">Zatím tu nic není. Napiš první zprávu!</p>
            ) : (
              <ul className="komunita-topics">
                {topics.map((t) => (
                  <li key={t.id} className="komunita-topic-item card">
                    <Link href={`/komunita/tema/${t.id}`} className="komunita-topic-link">
                      <span className="komunita-topic-meta">
                        {t.author_name} · {formatDate(t.created_at)}
                        {t.reply_count != null && t.reply_count > 0 && (
                          <> · {t.reply_count} {t.reply_count === 1 ? 'odpověď' : 'odpovědí'}</>
                        )}
                      </span>
                      <p className="komunita-topic-preview">{t.content}</p>
                      <span className="komunita-topic-reply-hint">Klikni a odpověz →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
      <Footer />

      <style jsx>{`
        .komunita-page {
          min-height: 100vh;
          background: linear-gradient(180deg, #0a021f 0%, #0d0d1a 30%, #0a0a12 100%);
          padding: 32px 20px 48px;
        }
        .komunita-container { max-width: 800px; margin: 0 auto; }
        .komunita-title { font-size: 1.75rem; font-weight: 700; color: #f1f5f9; margin: 0 0 8px; }
        .komunita-lead { color: #94a3b8; margin: 0 0 28px; font-size: 15px; line-height: 1.5; }
        .komunita-sections { margin-bottom: 32px; }
        .komunita-sections-title { font-size: 1.15rem; font-weight: 600; color: #e2e8f0; margin: 0 0 6px; }
        .komunita-sections-desc { font-size: 14px; color: #94a3b8; margin: 0 0 16px; line-height: 1.5; }
        .komunita-sections-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 14px;
        }
        .komunita-section-card {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
          padding: 18px 16px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(30, 41, 59, 0.5);
          color: #e2e8f0;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
        }
        .komunita-section-card:hover {
          border-color: rgba(124, 58, 237, 0.5);
          background: rgba(124, 58, 237, 0.1);
        }
        .komunita-section-card.active {
          border-color: #7c3aed;
          background: rgba(124, 58, 237, 0.2);
        }
        .komunita-section-icon { font-size: 1.5rem; margin-bottom: 8px; }
        .komunita-section-name { font-size: 1rem; font-weight: 600; color: #f1f5f9; margin-bottom: 4px; }
        .komunita-section-desc, .komunita-section-meta { font-size: 13px; color: #94a3b8; line-height: 1.4; margin-bottom: 8px; }
        .komunita-section-count { font-size: 12px; color: #64748b; }
        .komunita-form-title { font-size: 1.1rem; font-weight: 600; color: #e2e8f0; margin: 0 0 12px; }
        .komunita-form-card {
          margin-bottom: 28px;
          padding: 20px;
          background: rgba(30, 41, 59, 0.5);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
        }
        .komunita-toggle-new {
          padding: 8px 14px;
          border-radius: 8px;
          background: #7c3aed;
          color: #fff;
          border: none;
          font-weight: 600;
          cursor: pointer;
          font-size: 14px;
        }
        .komunita-toggle-new:hover { background: #6d28d9; }
        .komunita-form { margin-top: 16px; display: flex; flex-direction: column; gap: 14px; }
        .komunita-label { display: flex; flex-direction: column; gap: 6px; font-size: 14px; color: #94a3b8; }
        .komunita-input, .komunita-textarea {
          padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.3);
          background: rgba(15, 23, 42, 0.8); color: #e2e8f0; font-size: 15px; font-family: inherit;
        }
        .komunita-textarea { resize: vertical; min-height: 100px; }
        .komunita-submit {
          align-self: flex-start; padding: 10px 24px; border-radius: 10px; background: #7c3aed;
          color: #fff; font-weight: 600; border: none; cursor: pointer; font-size: 15px;
        }
        .komunita-submit:hover:not(:disabled) { background: #6d28d9; }
        .komunita-submit:disabled { opacity: 0.7; cursor: wait; }
        .komunita-feedback { margin: 0; font-size: 14px; }
        .komunita-feedback.success { color: #86efac; }
        .komunita-feedback.error { color: #fca5a5; }
        .komunita-list-title { font-size: 1.1rem; font-weight: 600; color: #e2e8f0; margin: 0 0 14px; }
        .komunita-loading, .komunita-error, .komunita-empty { color: #94a3b8; margin: 0; }
        .komunita-topics { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
        .komunita-topic-item { padding: 0; overflow: hidden; }
        .komunita-topic-link {
          display: block; padding: 18px 20px; text-decoration: none; color: inherit; transition: background 0.15s;
        }
        .komunita-topic-link:hover { background: rgba(124, 58, 237, 0.12); }
        .komunita-topic-title { font-size: 1.05rem; font-weight: 600; color: #f1f5f9; display: block; margin-bottom: 4px; }
        .komunita-topic-meta { font-size: 13px; color: #64748b; }
        .komunita-topic-preview { font-size: 14px; color: #94a3b8; margin: 10px 0 0; line-height: 1.5; }
      `}</style>
    </>
  );
}
