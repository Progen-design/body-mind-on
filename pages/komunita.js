// /pages/komunita.js – Fórum / zkušenosti (přístup jen po přihlášení)
import { useState, useEffect } from 'react';
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
  const [posts, setPosts] = useState([]);
  const [fetchError, setFetchError] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (!s) {
        setLoading(false);
        return;
      }
      setLoading(true);
      fetch('/api/community', { headers: { Authorization: `Bearer ${s.access_token}` } })
        .then((r) => r.json())
        .then((data) => {
          setPosts(Array.isArray(data.posts) ? data.posts : []);
          setFetchError(data.error || '');
        })
        .catch(() => {
          setPosts([]);
          setFetchError('Nepodařilo se načíst příspěvky.');
        })
        .finally(() => setLoading(false));
    });
  }, []);

  useEffect(() => {
    if (!loading && !session) router.replace('/login?redirect=/komunita');
  }, [loading, session, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!session?.access_token) return;
    setSubmitting(true);
    setSubmitMessage('');
    try {
      const res = await fetch('/api/community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitMessage(data.error || 'Odeslání se nepodařilo.');
        return;
      }
      setTitle('');
      setContent('');
      setSubmitMessage('Příspěvek byl přidán.');
      setPosts((prev) => [data.post, ...prev]);
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
        <main className="komunita-page">
          <p className="komunita-loading">Načítám…</p>
        </main>
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
          <h1 className="komunita-title">Komunita</h1>
          <p className="komunita-lead">
            Sdílej zkušenosti, tipy a postřehy – trénink, jídlo, motivace, cokoli. Přístup mají jen přihlášení členové.
          </p>

          <section className="komunita-form-card card">
            <h2 className="komunita-form-title">Napsat příspěvek</h2>
            <form onSubmit={handleSubmit} className="komunita-form">
              <label className="komunita-label">
                Nadpis
                <input
                  type="text"
                  className="komunita-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Např. Jak jsem zvládl první měsíc"
                  maxLength={200}
                  required
                />
              </label>
              <label className="komunita-label">
                Text
                <textarea
                  className="komunita-textarea"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Napiš, co chceš sdílet…"
                  rows={5}
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

          <section className="komunita-list">
            <h2 className="komunita-list-title">Příspěvky</h2>
            {loading ? (
              <p className="komunita-loading">Načítám příspěvky…</p>
            ) : fetchError ? (
              <p className="komunita-error">{fetchError}</p>
            ) : posts.length === 0 ? (
              <p className="komunita-empty">Zatím tu není žádný příspěvek. Buď první!</p>
            ) : (
              <ul className="komunita-posts">
                {posts.map((post) => (
                  <li key={post.id} className="komunita-post card">
                    <div className="komunita-post-header">
                      <span className="komunita-post-title">{post.title}</span>
                      <span className="komunita-post-meta">
                        {post.author_name} · {formatDate(post.created_at)}
                      </span>
                    </div>
                    <div className="komunita-post-content">{post.content}</div>
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
        .komunita-container {
          max-width: 720px;
          margin: 0 auto;
        }
        .komunita-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0 0 8px;
        }
        .komunita-lead {
          color: #94a3b8;
          margin: 0 0 28px;
          font-size: 15px;
          line-height: 1.5;
        }
        .komunita-form-card {
          margin-bottom: 32px;
          padding: 24px;
          background: rgba(30, 41, 59, 0.5);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
        }
        .komunita-form-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: #e2e8f0;
          margin: 0 0 16px;
        }
        .komunita-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .komunita-label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 14px;
          color: #94a3b8;
        }
        .komunita-input,
        .komunita-textarea {
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.3);
          background: rgba(15, 23, 42, 0.8);
          color: #e2e8f0;
          font-size: 15px;
          font-family: inherit;
        }
        .komunita-textarea {
          resize: vertical;
          min-height: 120px;
        }
        .komunita-input::placeholder,
        .komunita-textarea::placeholder {
          color: #64748b;
        }
        .komunita-submit {
          align-self: flex-start;
          padding: 10px 24px;
          border-radius: 10px;
          background: #7c3aed;
          color: #fff;
          font-weight: 600;
          border: none;
          cursor: pointer;
          font-size: 15px;
        }
        .komunita-submit:hover:not(:disabled) {
          background: #6d28d9;
        }
        .komunita-submit:disabled {
          opacity: 0.7;
          cursor: wait;
        }
        .komunita-feedback {
          margin: 0;
          font-size: 14px;
        }
        .komunita-feedback.success { color: #86efac; }
        .komunita-feedback.error { color: #fca5a5; }
        .komunita-list-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: #e2e8f0;
          margin: 0 0 16px;
        }
        .komunita-loading,
        .komunita-error,
        .komunita-empty {
          color: #94a3b8;
          margin: 0;
        }
        .komunita-posts {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .komunita-post {
          padding: 20px;
          background: rgba(30, 41, 59, 0.4);
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 12px;
        }
        .komunita-post-header {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 12px;
        }
        .komunita-post-title {
          font-size: 1.05rem;
          font-weight: 600;
          color: #f1f5f9;
        }
        .komunita-post-meta {
          font-size: 13px;
          color: #64748b;
        }
        .komunita-post-content {
          font-size: 15px;
          line-height: 1.6;
          color: #e2e8f0;
          white-space: pre-wrap;
          word-break: break-word;
        }
      `}</style>
    </>
  );
}
