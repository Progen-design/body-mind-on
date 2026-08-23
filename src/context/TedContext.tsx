import React, { createContext, useContext } from 'react';
import type { KotvaChatu } from '../components/CoachChatModal';

/**
 * Otevření chatu s TEDem odkudkoli z profilu.
 *
 * PROČ KONTEXT A NE PROP. Otazník `<Vysvetlivka />` sedí hluboko v kartách,
 * tabulkách a modalech. Protáhnout `onAskTed` skrz osm úrovní komponent by
 * znamenalo měnit rozhraní všeho, co je po cestě — a při příštím otazníku
 * znovu. Tohle je jediná věc, kterou takhle sdílíme.
 *
 * Výchozí hodnota nic nedělá: komponenta mimo `TedProvider` (třeba v testu)
 * se nesmí rozbít, jen nenabídne dotaz.
 */
interface TedContextValue {
  zeptejSe: (kotva?: KotvaChatu | null) => void;
  dostupny: boolean;
}

const TedContext = createContext<TedContextValue>({
  zeptejSe: () => {},
  dostupny: false,
});

export const TedProvider: React.FC<{
  zeptejSe: (kotva?: KotvaChatu | null) => void;
  children: React.ReactNode;
}> = ({ zeptejSe, children }) => (
  <TedContext.Provider value={{ zeptejSe, dostupny: true }}>
    {children}
  </TedContext.Provider>
);

export function useTed(): TedContextValue {
  return useContext(TedContext);
}
