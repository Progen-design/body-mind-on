import React, { useMemo } from 'react';
import { Vicenasobny, Popisek, type Volba } from './prvky.tsx';
import {
  CHIPY_POHYBOVYCH_VZORU,
  chipyNaPatterny,
  patternyNaChipy,
  textZbyvajicichCviku,
} from '../../data/treninkovaOmezeni.ts';
import { planExclusionCoverage } from '@lib/trainingExclusions.js';
import { MUSCLE_GROUP_IDS, getMuscleGroupLabel } from '@lib/muscleGroupLabels.js';

type Prostredi = 'gym' | 'home_equipment' | 'home_bodyweight';

const VOLBY_VZORU: readonly Volba[] = CHIPY_POHYBOVYCH_VZORU.map((c) => ({ value: c.id, label: c.label }));
const VOLBY_PARTII: readonly Volba[] = MUSCLE_GROUP_IDS.map((id: string) => ({ value: id, label: getMuscleGroupLabel(id) }));

interface TreninkovaOmezeniProps {
  prostredi: Prostredi;
  /** Uložené/odesílané pohybové vzory — RAW hodnoty z `training_exclusions.patterns`, ne chipy. */
  vybranePatterny: string[];
  /** Uložené/odesílané partie — `training_exclusions.muscles`, klíče z MUSCLE_GROUP_IDS. */
  vybranePartie: string[];
  generujeSe: boolean;
  onZmenaPatternu: (patterny: string[]) => void;
  onZmenaPartii: (partie: string[]) => void;
}

/**
 * Krok 3 registrace / nastavení profilu — vyloučení cviků a pohybových
 * vzorů. Chipy jsou čistě zobrazovací vrstva (`patternyNaChipy`/
 * `chipyNaPatterny` v src/data/treninkovaOmezeni.ts) — komponenta navenek
 * čte a vrací rovnou `training_exclusions.patterns`/`.muscles`, stejný tvar,
 * jaký čte/píše `lib/trainingExclusions.js` a `body_metrics.training_exclusions`.
 *
 * Živý počet se počítá z `planExclusionCoverage()` pro dané `prostredi`,
 * NIKDY z konstanty — strop se liší podle toho, jestli uživatel cvičí
 * v posilovně, doma s vybavením nebo bez něj.
 */
export const TreninkovaOmezeni: React.FC<TreninkovaOmezeniProps> = ({
  prostredi,
  vybranePatterny,
  vybranePartie,
  generujeSe,
  onZmenaPatternu,
  onZmenaPartii,
}) => {
  const vybraneChipy = useMemo(() => patternyNaChipy(vybranePatterny), [vybranePatterny]);

  const pokryti = useMemo(
    () => planExclusionCoverage({ patterns: vybranePatterny, muscles: vybranePartie }, prostredi),
    [vybranePatterny, vybranePartie, prostredi]
  );

  const zbyvaNaVybranePartie = vybranePartie.length
    ? vybranePartie.reduce((soucet, partie) => soucet + (pokryti.byMuscle[partie]?.remaining ?? 0), 0)
    : null;

  return (
    <fieldset disabled={generujeSe} className="space-y-5 disabled:opacity-50">
      <div>
        <Popisek volitelne>Cviky, kterým se chceš vyhnout</Popisek>
        <Vicenasobny
          popisek=""
          hodnoty={vybraneChipy}
          volby={VOLBY_VZORU}
          onZmena={(noveChipy) => onZmenaPatternu(chipyNaPatterny(noveChipy))}
        />
      </div>

      <div>
        <Popisek volitelne>Partie, kterým se chceš vyhnout</Popisek>
        <Vicenasobny
          popisek=""
          hodnoty={vybranePartie}
          volby={VOLBY_PARTII}
          onZmena={onZmenaPartii}
        />
      </div>

      <p className="text-[11px] text-slate-500">{textZbyvajicichCviku(pokryti.remaining, zbyvaNaVybranePartie)}</p>

      <p className="text-[11px] text-slate-600">
        Slouží k úpravě plánu. Nenahrazuje vyšetření u lékaře.
      </p>
    </fieldset>
  );
};

export default TreninkovaOmezeni;
