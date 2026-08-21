// /pages/komunita/tema/[id].js – detail tématu, odpovědi, formulář na odpověď
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import { supabase } from '../../../lib/supabaseClient';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TemaDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [session, setSession] = useState(null);
  const [topic, setTopic] = useState(null);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (!s) {
        setLoading(false);
        return;
      }
      if (!id) return;
      fetch(`/api/community/topic/${id}`, { headers: { Authorization: `Bearer ${s.access_token}` } })
        .then((r) => r.json())
        .then((data) => {
          setTopic(data.topic || null);
          setReplies(Array.isArray(data.replies) ? data.replies : []);
          setError(data.error || '');
        })
        .catch(() => {
          setTopic(null);
          setReplies([]);
          setError('Nepodařilo načíst téma.');
        })
        .finally(() => setLoading(false));
    });
  }, [id, session?.access_token]);

  useEffect(() => {
    if (!loading && !session) router.replace(`/login?redirect=/komunita/tema/${id}`);
  }, [loading, session, router, id]);

  async function handleReply(e) {
    e.preventDefault();
    if (!session?.access_token || !id) return;
    setSubmitting(true);
    setSubmitMessage('');
    try {
      const res = await fetch('/api/community/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ topic_id: id, content: replyContent.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitMessage(data.error || 'Odeslání se nepodařilo.');
        return;
      }
      setReplyContent('');
      setSubmitMessage('Odpověď byla přidána.');
      setReplies((prev) => [...prev, data.reply]);
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
        <main className="tema-page"><p className="tema-loading">Načítám…</p></main>
        <Footer />
      </>
    );
  }
  if (!session) return null;

  if (loading || !topic) {
    return (
      <>
        <Header />
        <main className="tema-page">
          <div className="tema-container">
            {error ? <p className="tema-error">{error}</p> : <p className="tema-loading">Načítám téma…</p>}
            <Link href="/komunita" className="tema-back">← Zpět na fórum</Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="tema-page">
        <div className="tema-container">
          <Link href="/komunita" className="tema-back">← Zpět na fórum</Link>

          <article className="tema-op card">
            <div className="tema-op-row">
              {topic.author_avatar_url ? (
                <img src={topic.author_avatar_url} alt="" className="tema-op-avatar" />
              ) : (
                <span className="tema-op-avatar-placeholder">{topic.author_name?.charAt(0)?.toUpperCase() || '?'}</span>
              )}
              <div className="tema-op-body">
                <h1 className="tema-title">{topic.title}</h1>
                <div className="tema-meta">
                  {topic.author_name} · {formatDate(topic.created_at)}
                </div>
                <div className="tema-content">{topic.content}</div>
              </div>
            </div>
          </article>

          <section className="tema-replies">
            <h2 className="tema-replies-title">
              Odpovědi {replies.length > 0 && `(${replies.length})`}
            </h2>
            {replies.length === 0 ? (
              <p className="tema-no-replies">Zatím žádné odpovědi. Napiš první!</p>
            ) : (
              <ul className="tema-replies-list">
                {replies.map((r) => (
                  <li key={r.id} className="tema-reply card">
                    <div className="tema-reply-row">
                      {r.author_avatar_url ? (
                        <img src={r.author_avatar_url} alt="" className="tema-reply-avatar" />
                      ) : (
                        <span className="tema-reply-avatar-placeholder">{r.author_name?.charAt(0)?.toUpperCase() || '?'}</span>
                      )}
                      <div className="tema-reply-body">
                        <div className="tema-reply-meta">{r.author_name} · {formatDate(r.created_at)}</div>
                        <div className="tema-reply-content">{r.content}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="tema-reply-form card">
            <h3 className="tema-reply-form-title">Přidat odpověď</h3>
            <form onSubmit={handleReply} className="tema-form">
              <textarea
                className="tema-textarea"
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Napiš svou odpověď…"
                rows={4}
                required
              />
              <button type="submit" className="tema-submit" disabled={submitting}>
                {submitting ? 'Odesílám…' : 'Odeslat odpověď'}
              </button>
              {submitMessage && (
                <p className={`tema-feedback ${submitMessage.includes('nepodařilo') ? 'error' : 'success'}`}>
                  {submitMessage}
                </p>
              )}
            </form>
          </section>
        </div>
      </main>
      <Footer />

      <style jsx>{`
        .tema-page {
          min-height: 100vh;
          background: linear-gradient(180deg, #0a021f 0%, #0d0d1a 30%, #0a0a12 100%);
          padding: 32px 20px 48px;
        }
        .tema-container { max-width: 720px; margin: 0 auto; }
        .tema-back {
          display: inline-block; margin-bottom: 20px; color: #94a3b8; text-decoration: none; font-size: 14px;
        }
        .tema-back:hover { color: #e2e8f0; }
        .tema-loading, .tema-error { color: #94a3b8; margin: 0 0 16px; }
        .tema-op {
          padding: 24px; margin-bottom: 24px;
          background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 12px;
        }
        .tema-op-row { display: flex; align-items: flex-start; gap: 16px; }
        .tema-op-avatar, .tema-op-avatar-placeholder {
          width: 48px; height: 48px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
          border: 1px solid rgba(148, 163, 184, 0.25);
        }
        .tema-op-avatar-placeholder {
          display: inline-flex; align-items: center; justify-content: center;
          background: rgba(51, 65, 85, 0.6); color: #94a3b8; font-size: 18px; font-weight: 600;
        }
        .tema-op-body { flex: 1; min-width: 0; }
        .tema-title { font-size: 1.35rem; font-weight: 700; color: #f1f5f9; margin: 0 0 10px; }
        .tema-meta { font-size: 14px; color: #64748b; margin-bottom: 16px; }
        .tema-content { font-size: 15px; line-height: 1.6; color: #e2e8f0; white-space: pre-wrap; word-break: break-word; }
        .tema-replies { margin-bottom: 24px; }
        .tema-replies-title { font-size: 1.1rem; font-weight: 600; color: #e2e8f0; margin: 0 0 14px; }
        .tema-no-replies { color: #94a3b8; margin: 0; font-size: 14px; }
        .tema-replies-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
        .tema-reply {
          padding: 18px 20px;
          background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 12px;
        }
        .tema-reply-row { display: flex; align-items: flex-start; gap: 12px; }
        .tema-reply-avatar, .tema-reply-avatar-placeholder {
          width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
        }
        .tema-reply-avatar-placeholder {
          display: inline-flex; align-items: center; justify-content: center;
          background: rgba(51, 65, 85, 0.6); color: #94a3b8; font-size: 14px; font-weight: 600;
        }
        .tema-reply-body { flex: 1; min-width: 0; }
        .tema-reply-meta { font-size: 13px; color: #64748b; margin-bottom: 8px; }
        .tema-reply-content { font-size: 15px; line-height: 1.6; color: #e2e8f0; white-space: pre-wrap; word-break: break-word; }
        .tema-reply-form {
          padding: 20px; background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 12px;
        }
        .tema-reply-form-title { font-size: 1rem; font-weight: 600; color: #e2e8f0; margin: 0 0 12px; }
        .tema-form { display: flex; flex-direction: column; gap: 12px; }
        .tema-textarea {
          padding: 12px 14px; border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.3);
          background: rgba(15, 23, 42, 0.8); color: #e2e8f0; font-size: 15px; font-family: inherit; resize: vertical;
        }
        .tema-submit {
          align-self: flex-start; padding: 10px 24px; border-radius: 10px; background: #7c3aed; color: #fff;
          font-weight: 600; border: none; cursor: pointer; font-size: 15px;
        }
        .tema-submit:hover:not(:disabled) { background: #6d28d9; }
        .tema-submit:disabled { opacity: 0.7; cursor: wait; }
        .tema-feedback { margin: 0; font-size: 14px; }
        .tema-feedback.success { color: #86efac; }
        .tema-feedback.error { color: #fca5a5; }
      `}</style>
    </>
  );
}
