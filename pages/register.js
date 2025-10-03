// výřez z /pages/register.js
const onSubmit = async (e) => {
  e.preventDefault();
  setLoading(true); setMsg(null);

  try {
    const payload = {
      name, email,
      gender,
      age,
      height_cm,
      weight_kg,
      activity,
      stress_level,
      occupation,
      goal,
      freq_choice,
      notes
    };

    const res = await fetch('/api/body-metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Unknown error');
    setMsg('Úspěšně odesláno ✅');
  } catch (err) {
    console.error('[register] submit error:', err);
    setMsg('Chyba při odeslání ❌: ' + err.message);
  } finally {
    setLoading(false);
  }
};
