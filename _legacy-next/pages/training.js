import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export default function Training() {
  const router = useRouter();
  const [duration, setDuration] = useState(60);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const d = Number(router.query.duration || 60);
    if ([30, 60, 90].includes(d)) setDuration(d);
  }, [router.query.duration]);

  async function submit() {
    setSaving(true);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duration }),
    });
    if (res.ok) setOk(true);
    setSaving(false);
  }

  return (
    <main className="max-w-lg mx-auto py-16 px-4 text-white">
      <h1 className="text-3xl font-bold mb-6">Objednat trénink 1:1</h1>
      <label className="block text-sm text-neutral-300 mb-1">Délka tréninku</label>
      <select
        value={duration}
        onChange={(e) => setDuration(Number(e.target.value))}
        className="w-full bg-[#1F1F1F] p-3 rounded-xl text-white"
      >
        <option value={30}>30 min (790 Kč)</option>
        <option value={60}>60 min (1 190 Kč)</option>
        <option value={90}>90 min (1 690 Kč)</option>
      </select>

      <button
        onClick={submit}
        disabled={saving}
        className="mt-6 w-full bg-[#3498DB] text-white rounded-xl px-4 py-3 font-medium"
      >
        {saving ? "Ukládám..." : "Odeslat objednávku"}
      </button>

      {ok && <p className="mt-4 text-[#2ECC71]">Objednávka vytvořena ✅</p>}
    </main>
  );
}
