import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { HabitUiButton } from '../habit/HabitUiPrimitives';

const RATING_OPTIONS = [
  { value: 'great', label: 'Skvěle' },
  { value: 'good', label: 'Dobře' },
  { value: 'partial', label: 'Částečně' },
  { value: 'none', label: 'Vůbec' },
];

const BLOCKER_OPTIONS = [
  { value: 'no_time', label: 'Neměl/a jsem čas' },
  { value: 'food_mismatch', label: 'Jídlo mi nevyhovovalo' },
  { value: 'workout_too_hard', label: 'Trénink byl moc těžký' },
  { value: 'workout_too_easy', label: 'Trénink byl moc lehký' },
  { value: 'no_motivation', label: 'Neměl/a jsem motivaci' },
  { value: 'technical_problem', label: 'Technický problém' },
  { value: 'other', label: 'Jiné' },
];

export default function DailyCheckinPanel() {
  const [rating, setRating] = useState('');
  const [blocker, setBlocker] = useState('');
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch('/api/daily-checkin', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.checkin) {
          setRating(json.checkin.rating || '');
          setBlocker(json.checkin.blocker || '');
          setSaved(true);
        }
      } catch {
        /* silent */
      }
    })();
  }, []);

  const submit = async () => {
    if (!rating || submitting) return;
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/daily-checkin', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rating,
          blocker: blocker || null,
        }),
      });
      if (res.ok) {
        setSaved(true);
      }
    } catch {
      /* silent */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="daily-checkin">
      <h3 className="daily-checkin-title">Jak se ti dnes plán dařil?</h3>
      <div className="daily-checkin-ratings" role="radiogroup" aria-label="Hodnocení dne">
        {RATING_OPTIONS.map((opt) => (
          <HabitUiButton
            key={opt.value}
            variant="pill"
            className={rating === opt.value ? 'habit-ui-btn--pill-active' : ''}
            onClick={() => setRating(opt.value)}
            aria-pressed={rating === opt.value}
          >
            {opt.label}
          </HabitUiButton>
        ))}
      </div>
      {rating && rating !== 'great' && (
        <div className="daily-checkin-blockers">
          <p className="daily-checkin-sub">Co byl největší problém? (volitelné)</p>
          <div className="daily-checkin-blocker-list">
            {BLOCKER_OPTIONS.map((opt) => (
              <HabitUiButton
                key={opt.value}
                variant="pill"
                size="sm"
                className={blocker === opt.value ? 'habit-ui-btn--pill-active' : ''}
                onClick={() => setBlocker(blocker === opt.value ? '' : opt.value)}
              >
                {opt.label}
              </HabitUiButton>
            ))}
          </div>
        </div>
      )}
      <HabitUiButton
        className="daily-checkin-save"
        disabled={!rating || submitting}
        onClick={submit}
      >
        {submitting ? 'Ukládám…' : saved ? 'Aktualizovat check-in' : 'Uložit check-in'}
      </HabitUiButton>
      <style jsx>{`
        .daily-checkin {
          margin-top: 1rem;
          padding-top: 0.85rem;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .daily-checkin-title {
          margin: 0 0 0.5rem;
          font-size: 0.95rem;
          font-weight: 600;
          color: #e2e8f0;
        }
        .daily-checkin-ratings,
        .daily-checkin-blocker-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }
        .daily-checkin-sub {
          margin: 0.5rem 0 0.35rem;
          font-size: 0.82rem;
          color: #94a3b8;
        }
        .daily-checkin-save {
          margin-top: 0.65rem;
        }
      `}</style>
    </div>
  );
}
