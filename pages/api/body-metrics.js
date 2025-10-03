// /pages/api/body-metrics.js
import { supabaseServer } from '../../lib/supabaseServer';

const MAPS = {
  gender: {
    'muž': 'male', 'muz': 'male', 'm': 'male', 'male': 'male',
    'žena': 'female', 'zena': 'female', 'f': 'female', 'female': 'female'
  },
  activity: {
    'sedavý': 'sedavy', 'sedavy': 'sedavy',
    'lehce aktivní': 'lehce', 'lehce': 'lehce',
    'středně aktivní': 'stredne', 'stredně': 'stredne', 'stredne': 'stredne',
    'velmi aktivní': 'velmi', 'velmi': 'velmi',
    'extra aktivní': 'extra', 'extra': 'extra'
  },
  stress_level: {
    'nízká': 'low', 'nizka': 'low', 'low': 'low',
    'střední': 'medium', 'stredni': 'medium', 'medium': 'medium',
    'vysoká': 'high', 'vysoka': 'high', 'high': 'high'
  },
  occupation: {
    'kancelář / it': 'office_it', 'kancelar / it': 'office_it', 'office_it': 'office_it',
    'řidič': 'driver', 'ridic': 'driver', 'driver': 'driver',
    'sklad / logistika': 'warehouse', 'warehouse': 'warehouse',
    'manuální práce': 'manual', 'manual': 'manual',
    'zdravotnictví': 'healthcare', 'healthcare': 'healthcare',
    'učitel / obchod'
