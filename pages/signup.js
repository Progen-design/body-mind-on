import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import supabase from "@/lib/supabaseClient";

export default function Signup() {
  const router = useRouter();
  const [plan, setPlan] = useState(null);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    const selected = router.query.plan;
    if (selected) {
      setPlan(selected);
      localStorage.setItem("preferred_plan", selected);
    }
  }, [router.query.plan]);

  async function handleSave() {
    try {
      setStatus("saving");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { error } = await supabase
        .from("users")
        .update({ plan })
        .eq("id", user.id);

      if (error) throw error;

      setStatus("done");
      router.push("/dashboard");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  return (
    <main className="max-w-xl mx-auto py-16 px-4 text-white">
      <h1 className="text-3xl font-bold">Založit účet</h1>
      <p className="mt-2 text-neutral-400">
        Vybraný plán: <strong>{plan || "neuveden"}</strong>
      </p>
      <button
        onClick={handleSave}
        className="mt-6 w-full rounded-xl bg-[#2ECC71] px-4 py-3 font-medium text-black"
      >
        {status === "saving" ? "Ukládám..." : "Pokračovat"}
      </button>
      {status === "error" && (
        <p className="text-red-400 mt-3 text-sm">Uložení selhalo. Zkuste znovu.</p>
      )}
    </main>
  );
}
