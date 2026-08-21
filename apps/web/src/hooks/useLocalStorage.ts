import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Společný prefix pro všechny klíče aplikace v localStorage.
 * Díky němu poznáme naše data od dat jiných aplikací na stejné doméně.
 */
export const STORAGE_PREFIX = 'bmon:v1:';

export const storageKey = (key: string) => `${STORAGE_PREFIX}${key}`;

/** Bezpečné čtení — localStorage může být nedostupné (private mode, blokované cookies). */
export function readStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeStored<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    // Kvóta plná nebo zakázané úložiště — aplikace běží dál jen s pamětí v RAM.
  }
}

export function removeStored(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(key));
  } catch {
    /* ignorujeme */
  }
}

/** Smaže všechna data aplikace (jen klíče s naším prefixem). */
export function clearAllStored(): void {
  if (typeof window === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    keys.forEach(k => window.localStorage.removeItem(k));
  } catch {
    /* ignorujeme */
  }
}

/**
 * useState, který svůj stav trvale ukládá do localStorage.
 * Po obnovení stránky (F5) se stav načte zpět.
 *
 * `migrate` umožní doplnit chybějící pole, když se od minulé návštěvy
 * rozšířil tvar dat (uložená data jsou starší než kód).
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  migrate?: (stored: T, initial: T) => T
): [T, Dispatch<SetStateAction<T>>] {
  const migrateRef = useRef(migrate);
  migrateRef.current = migrate;

  const initialRef = useRef(initialValue);

  const load = (loadKey: string): T => {
    const stored = readStored<T | undefined>(loadKey, undefined);
    if (stored === undefined) return initialRef.current;
    return migrateRef.current ? migrateRef.current(stored, initialRef.current) : stored;
  };

  const [value, setValue] = useState<T>(() => load(key));

  // Změna klíče (např. přepnutí profilu) načte data patřící novému klíči.
  const keyRef = useRef(key);
  if (keyRef.current !== key) {
    keyRef.current = key;
    setValue(load(key));
  }

  useEffect(() => {
    writeStored(key, value);
  }, [key, value]);

  return [value, setValue];
}

/** Vrátí funkci, která smaže konkrétní klíč a vrátí stav na výchozí hodnotu. */
export function useResetStored(key: string, reset: () => void) {
  return useCallback(() => {
    removeStored(key);
    reset();
  }, [key, reset]);
}
