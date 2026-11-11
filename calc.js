/* AERIQ · motor de cálculo (puro, sin DOM).
   Fórmulas idénticas a la app original VENTSTEDICK (MainActivity.kt). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AERIQCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CFM_PER_M3MIN = 35.3146667;

  /** Convierte texto ("1,5" / "1.5" / "") a número; vacío -> NaN */
  function parse(v) {
    if (v === null || v === undefined) return NaN;
    const s = String(v).trim().replace(',', '.');
    return s === '' ? NaN : Number(s);
  }

  /** m³/min por persona según altitud y método */
  function workerRate(alt, method) {
    const h = Number.isFinite(alt) ? alt : 0;
    if (method === 'escalonado') {
      if (h <= 1500) return 3;
      if (h <= 3000) return 4;
      if (h <= 4000) return 5;
      return 6;
    }
    // método original VENTSTEDICK
    return h > 1500 ? 6 : 3;
  }

  /**
   * @param {object} i  entradas numéricas (NaN = vacío):
   *   metano, produccion, trabajadores, explosivos, tiempoAire,
   *   hp, co, altura, turno, fs
   * @param {{method?: 'original'|'escalonado'}} opts
   */
  function calcular(i, opts) {
    const method = (opts && opts.method) || 'original';
    const z = (x) => (Number.isFinite(x) ? x : 0);
    const warnings = [];

    const vMetano = z(i.metano), prod = z(i.produccion), nTrab = z(i.trabajadores);
    const a = z(i.explosivos), tAire = z(i.tiempoAire), hp = z(i.hp), co = z(i.co);
    const alt = z(i.altura), tTurno = z(i.turno);
    const k = Number.isFinite(i.fs) && i.fs > 0 ? i.fs : 1;

    for (const [key, val] of Object.entries(i)) {
      if (Number.isFinite(val) && val < 0) warnings.push({ field: key, msg: 'No se admiten valores negativos.' });
    }

    const rate = workerRate(alt, method);
    const trabajadores = nTrab * rate;

    let metano = 0;
    if (tTurno > 0) metano = (100 * (vMetano * prod)) / tTurno;
    else if (vMetano * prod > 0) warnings.push({ field: 'turno', msg: 'Falta la duración del turno: el caudal por metano no se pudo calcular.' });

    let voladura = 0;
    if (a > 0 && tAire > 0) voladura = (100 * 0.04 * a) / (0.008 * tAire);
    else if (a > 0) warnings.push({ field: 'tiempoAire', msg: 'Falta el tiempo de aireación: el caudal por voladura no se pudo calcular.' });

    let maquinaria = 0;
    let complete = true;
    if (hp > 0) {
      if (co <= 0.08) {
        maquinaria = hp * 4;
      } else if (co <= 0.12) {
        maquinaria = hp * 6;
      } else {
        complete = false;
        warnings.push({ field: 'co', msg: 'CO > 0,12 %: el artículo 54, parágrafo 2, no define aquí un factor para este caso. El caudal total queda incompleto; requiere revisión técnica.' });
      }
    }

    if (!Number.isFinite(i.fs) || !(i.fs > 0)) warnings.push({ field: 'fs', msg: 'Sin factor de seguridad: se asume 1,0.' });

    const components = { trabajadores, metano, voladura, maquinaria };
    const subtotal = trabajadores + metano + voladura + maquinaria;
    const total = complete ? subtotal * k : null;

    let governing = null, max = 0;
    for (const [name, v] of Object.entries(components)) if (v > max) { max = v; governing = name; }

    return { components, subtotal, total, complete, k, rate, method, governing, warnings };
  }

  const convert = {
    'm3min': (q) => q,
    'm3s': (q) => q / 60,
    'cfm': (q) => q * CFM_PER_M3MIN,
  };

  return { parse, workerRate, calcular, convert, CFM_PER_M3MIN };
});
