import React, { useState } from 'react';
import { spustitCheckout } from '../lib/stripeCheckout';
import { PlanPozastavenyKarta } from './PlanPozastavenyKarta';

/**
 * Karta „plán je pozastavený" s napojeným Checkoutem START.
 * Vzhled a texty jsou v PlanPozastavenyKarta.tsx.
 */
export const PlanPozastaveny: React.FC = () => {
  const [odemykam, setOdemykam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  async function odemknout() {
    setChyba(null);
    setOdemykam(true);
    try {
      window.location.href = await spustitCheckout('START');
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Checkout se nepodařilo spustit.');
      setOdemykam(false);
    }
  }

  return <PlanPozastavenyKarta onOdemknout={odemknout} odemykam={odemykam} chyba={chyba} />;
};
