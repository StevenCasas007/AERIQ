/* AERIQ · interfaz */
(function () {
  'use strict';
  const VERSION = '1.6.7';
  const C = window.AERIQCalc;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- almacenamiento seguro ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  };

  /* ---------- definición de campos ---------- */
  const SECTIONS = [
    { id: 'trab', title: 'Personal', color: 'var(--c-trab)', fields: [
      { id: 'trabajadores', label: 'N.º de trabajadores (turno)', unit: 'pers.', ph: '0' },
      { id: 'altura', label: 'Altitud', unit: 'msnm', ph: '0', hint: 'Define el caudal por persona.' },
    ]},
    { id: 'met', title: 'Metano', color: 'var(--c-met)', fields: [
      { id: 'metano', label: 'Volumen de metano', unit: 'm³/ton', ph: '0' },
      { id: 'produccion', label: 'Producción diaria', unit: 'ton', ph: '0' },
      { id: 'turno', label: 'Duración del turno', unit: 'min', ph: '480' },
    ]},
    { id: 'vol', title: 'Voladura', color: 'var(--c-vol)', fields: [
      { id: 'explosivos', label: 'Explosivos', unit: 'kg', ph: '0' },
      { id: 'tiempoAire', label: 'Tiempo de aireación', unit: 'min', ph: '0' },
    ]},
    { id: 'maq', title: 'Maquinaria diésel', color: 'var(--c-maq)', fields: [
      { id: 'hp', label: 'Suma HP de maquinaria', unit: 'HP', ph: '0' },
      { id: 'co', label: 'CO en gases del exosto', unit: '%', ph: '0,08', hint: 'Art. 54, par. 2: ≤ 0,08 % → 4 m³/min·HP; > 0,08 % y ≤ 0,12 % → 6 m³/min·HP. > 0,12 % requiere revisión técnica.' },
    ]},
    { id: 'seg', title: 'Seguridad', color: 'var(--accent)', fields: [
      { id: 'fs', label: 'Factor de seguridad', unit: '×', ph: '1,0', hint: 'Si lo dejas vacío se usa 1,0.' },
    ]},
  ];
  const FIELD_IDS = SECTIONS.flatMap(s => s.fields.map(f => f.id));
  const COMP = {
    trabajadores: { name: 'Personal', color: 'var(--c-trab)' },
    metano: { name: 'Metano', color: 'var(--c-met)' },
    voladura: { name: 'Voladura', color: 'var(--c-vol)' },
    maquinaria: { name: 'Maquinaria', color: 'var(--c-maq)' },
  };
  const UNITS = { m3min: 'm³/min', m3s: 'm³/s', cfm: 'CFM' };
  const METHOD_HINT = {
    original: 'Método de VENTSTEDICK: 3 m³/min por persona hasta 1 500 msnm y 6 m³/min por encima.',
    escalonado: 'Por rangos: 3 (≤1 500 msnm) · 4 (≤3 000) · 5 (≤4 000) · 6 (>4 000) m³/min por persona. Verifica con tu normativa.',
  };

  /* ---------- construir formulario ---------- */
  const secWrap = $('#sections');
  secWrap.innerHTML = SECTIONS.map(s => `
    <div class="card">
      <h2><i style="background:${s.color}"></i>${s.title}</h2>
      <div class="grid">${s.fields.map(f => `
        <label class="field" data-f="${f.id}">
          <span class="lbl">${f.label}</span>
          <span class="inwrap">
            <input type="text" id="f_${f.id}" inputmode="decimal" placeholder="${f.ph}" autocomplete="off" enterkeyhint="next">
            <span class="unit">${f.unit}</span>
          </span>
          ${f.hint ? `<span class="hint">${f.hint}</span>` : ''}
          <span class="ferr" hidden></span>
        </label>`).join('')}
      </div>
    </div>`).join('');

  /* ---------- estado ---------- */
  let state = Object.assign({ nombre: '', method: 'original', unit: 'm3min', values: {} }, store.get('aeriq:draft', {}));
  if (!['m3min','cfm'].includes(state.unit)) state.unit = 'm3min';
  let last = null; // último cálculo

  // 1 234,5 → espacio fino como separador de miles y coma decimal (sin ambigüedad entre países)
  const fmt = (n, d = 2) => (Number.isFinite(n) ? n : 0)
    .toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 })
    .replace(/,/g, ' ').replace('.', ',');
  const toUnit = (q) => C.convert[state.unit](q);
  const fmtU = (q) => fmt(toUnit(q), state.unit === 'm3s' ? 3 : 1);

  function readInputs() {
    const o = {};
    FIELD_IDS.forEach(id => { o[id] = C.parse($('#f_' + id).value); });
    return o;
  }
  function readRaw() {
    const o = {};
    FIELD_IDS.forEach(id => { o[id] = $('#f_' + id).value; });
    return o;
  }

  /* ---------- cálculo + render ---------- */
  function update() {
    const inp = readInputs();
    const res = C.calcular({
      metano: inp.metano, produccion: inp.produccion, trabajadores: inp.trabajadores, explosivos: inp.explosivos,
      tiempoAire: inp.tiempoAire, hp: inp.hp, co: inp.co, altura: inp.altura, turno: inp.turno, fs: inp.fs,
    }, { method: state.method });
    last = res;
    try { localStorage.setItem('aeriq:last-airflow', JSON.stringify({ totalM3min: res.total, date: new Date().toISOString(), complete: res.complete })); } catch {}

    $('#total').textContent = res.total === null ? '—' : fmtU(res.total);
    $('#unitLbl').textContent = UNITS[state.unit];
    $('#subtotalLine').textContent = res.subtotal > 0
      ? (res.total === null ? `Subtotal parcial: ${fmtU(res.subtotal)} ${UNITS[state.unit]} · Total no calculado` : `Σ ${fmtU(res.subtotal)} ${UNITS[state.unit]} × FS ${fmt(res.k, 2)}`)
      : 'Ingresa los datos para calcular.';

    const max = Math.max(...Object.values(res.components), 0);
    $('#bars').innerHTML = Object.entries(COMP).map(([key, m]) => {
      const q = res.components[key];
      const pct = res.subtotal > 0 ? (q / res.subtotal) * 100 : 0;
      const w = max > 0 ? (q / max) * 100 : 0;
      return `<div class="bar ${res.governing === key ? 'gov' : ''}">
        <div class="meta"><b>${m.name}</b><span>${fmtU(q)} ${UNITS[state.unit]} · ${fmt(pct, 0)} %</span></div>
        <div class="track"><div class="fill" style="width:${w}%;background:${m.color}"></div></div></div>`;
    }).join('');

    $('#governing').innerHTML = res.governing
      ? `Mayor demanda: <b>${COMP[res.governing].name}</b> (${fmt((res.components[res.governing] / res.subtotal) * 100, 0)} % del total)`
      : '';

    // advertencias globales + por campo
    $$('.field[data-f]').forEach(f => { f.classList.remove('err'); const e = $('.ferr', f); e.hidden = true; });
    const globals = [];
    res.warnings.forEach(w => {
      const f = $(`.field[data-f="${w.field}"]`);
      if (f && (w.field === 'turno' || w.field === 'tiempoAire' || w.field === 'co' || w.msg.startsWith('No se'))) {
        if (w.msg.startsWith('No se')) f.classList.add('err');
        const e = $('.ferr', f); e.textContent = w.msg; e.hidden = false;
      } else globals.push(w.msg);
    });
    $('#warnings').innerHTML = globals.map(m => `<li>${m}</li>`).join('');

    $('#methodHint').textContent = METHOD_HINT[state.method];
    document.body.dataset.hasResult = res.total > 0 ? '1' : '0';
    $$('#saveBtn,#shareBtn,#printBtn').forEach(b => b.disabled = !(res.total > 0));
    $$('#saveBtn,#shareBtn,#printBtn').forEach(b => b.style.opacity = res.total > 0 ? 1 : .5);

    state.values = readRaw();
    state.nombre = $('#nombre').value;
    store.set('aeriq:draft', { nombre: state.nombre, method: state.method, unit: state.unit, values: state.values });
  }

  /* ---------- toast ---------- */
  let tt;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- eventos del formulario ---------- */
  FIELD_IDS.forEach(id => {
    $('#f_' + id).addEventListener('input', e => {
      // solo dígitos, coma y punto
      const v = e.target.value.replace(/[^\d.,]/g, '');
      if (v !== e.target.value) e.target.value = v;
      update();
    });
  });
  $('#nombre').addEventListener('input', update);
  $('#form').addEventListener('submit', e => e.preventDefault());
  $$('input[name=method]').forEach(r => r.addEventListener('change', e => { state.method = e.target.value; update(); }));
  $$('input[name=unit]').forEach(r => r.addEventListener('change', e => { state.unit = e.target.value; update(); }));
  /* ---------- conversor rápido independiente (no interviene en el cálculo) ---------- */
  const converterInputs = { m3s: $('#convertM3s'), m3min: $('#convertM3min'), cfm: $('#convertCfm') };
  const parseConverter = value => {
    const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
    return normalized === '' ? NaN : Number(normalized);
  };
  const converterFmt = value => Number.isFinite(value)
    ? String(Number(value.toFixed(6))) : '';
  function updateQuickConverter(source) {
    const value = parseConverter(converterInputs[source].value);
    if (!Number.isFinite(value)) {
      Object.entries(converterInputs).filter(([key]) => key !== source).forEach(([, input]) => { input.value = ''; });
      return;
    }
    if (value < 0) return;
    const m3s = source === 'm3s' ? value : source === 'm3min' ? value / 60 : value / (60 * C.CFM_PER_M3MIN);
    const values = { m3s, m3min: m3s * 60, cfm: m3s * 60 * C.CFM_PER_M3MIN };
    Object.entries(converterInputs).forEach(([key, input]) => {
      if (key !== source) input.value = converterFmt(values[key]);
    });
  }
  Object.entries(converterInputs).forEach(([key, input]) => {
    input.addEventListener('input', () => updateQuickConverter(key));
  });
  $('#clearBtn').addEventListener('click', () => {
    FIELD_IDS.forEach(id => { $('#f_' + id).value = ''; });
    $('#nombre').value = '';
    update(); toast('Formulario limpio');
  });

  /* ---------- historial ---------- */
  const getHist = () => store.get('aeriq:hist', []);
  const setHist = (h) => store.set('aeriq:hist', h);

  function saveCurrent() {
    if (!last || !(last.total > 0)) return;
    const h = getHist();
    h.unshift({
      id: Date.now(), nombre: $('#nombre').value.trim() || 'Sin nombre', fecha: new Date().toISOString(),
      method: state.method, values: readRaw(), components: last.components, subtotal: last.subtotal, k: last.k, total: last.total,
    });
    setHist(h.slice(0, 200));
    renderHist(); toast('Cálculo guardado');
  }

  function renderHist() {
    const h = getHist();
    const box = $('#histList');
    if (!h.length) { box.innerHTML = '<div class="empty">Aún no hay cálculos guardados.<br>Calcula y pulsa <b>Guardar</b>.</div>'; return; }
    box.innerHTML = h.map(x => `
      <div class="card hitem" data-id="${x.id}">
        <div class="t"><b>${esc(x.nombre)}</b><span class="q">${fmt(x.total, 1)} <small>m³/min</small></span></div>
        <div class="d">${new Date(x.fecha).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })} · FS ${fmt(x.k, 2)}</div>
        <div class="a"><button class="btn small" data-act="load">Cargar</button><button class="btn small danger" data-act="del">Eliminar</button></div>
      </div>`).join('');
  }
  $('#histList').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const id = Number(b.closest('.hitem').dataset.id);
    let h = getHist();
    if (b.dataset.act === 'del') {
      if (!confirm('¿Eliminar este cálculo?')) return;
      h = h.filter(x => x.id !== id); setHist(h); renderHist();
    } else {
      const x = h.find(i => i.id === id); if (!x) return;
      FIELD_IDS.forEach(f => { $('#f_' + f).value = x.values[f] || ''; });
      $('#nombre').value = x.nombre === 'Sin nombre' ? '' : x.nombre;
      state.method = x.method; $(`input[name=method][value=${x.method}]`).checked = true;
      update(); show('calc'); toast('Cálculo cargado');
    }
  });
  $('#csvBtn').addEventListener('click', () => {
    const h = getHist(); if (!h.length) return toast('No hay datos que exportar');
    const head = ['Nombre', 'Fecha', 'Método', 'Personal m3/min', 'Metano m3/min', 'Voladura m3/min', 'Maquinaria m3/min', 'Suma m3/min', 'FS', 'Total m3/min', ...FIELD_IDS];
    const rows = h.map(x => [x.nombre, x.fecha, x.method, ...['trabajadores', 'metano', 'voladura', 'maquinaria'].map(k => x.components[k].toFixed(3)),
      x.subtotal.toFixed(3), x.k, x.total.toFixed(3), ...FIELD_IDS.map(f => x.values[f] || '')]);
    const csv = '﻿' + [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'aeriq-historial.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ---------- compartir / imprimir ---------- */
  function summaryText() {
    const r = last, u = UNITS[state.unit];
    const nm = $('#nombre').value.trim();
    return [
      'AERIQ · Caudal de ventilación' + (nm ? ' — ' + nm : ''),
      ...Object.entries(COMP).map(([k, m]) => `• ${m.name}: ${fmtU(r.components[k])} ${u}`),
      `Σ sin FS: ${fmtU(r.subtotal)} ${u}`,
      `FS: ${fmt(r.k, 2)}`,
      `TOTAL REQUERIDO: ${fmtU(r.total)} ${u}`,
    ].join('\n');
  }
  $('#shareBtn').addEventListener('click', async () => {
    const text = summaryText();
    try {
      if (navigator.share) { await navigator.share({ title: 'AERIQ', text }); return; }
      await navigator.clipboard.writeText(text); toast('Resultado copiado');
    } catch (e) { if (e && e.name !== 'AbortError') toast('No se pudo compartir'); }
  });
  $('#saveBtn').addEventListener('click', saveCurrent);
  $('#printBtn').addEventListener('click', () => {
    const r = last, u = UNITS[state.unit], inp = readRaw();
    const unitOf = Object.fromEntries(SECTIONS.flatMap(s => s.fields.map(f => [f.id, f])));
    $('#report').innerHTML = `
      <h1>AERIQ</h1>
      <div class="sub">Cálculo de caudal de ventilación minera · ${new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })}</div>
      <p><b>Proyecto / labor:</b> ${esc($('#nombre').value.trim() || '—')}</p>
      <table><thead><tr><th>Dato de entrada</th><th>Valor</th></tr></thead><tbody>
        ${FIELD_IDS.map(id => `<tr><td>${unitOf[id].label}</td><td class="n">${esc(inp[id] || '—')} ${inp[id] ? unitOf[id].unit : ''}</td></tr>`).join('')}
        <tr><td>Método de caudal por personal</td><td class="n">${state.method === 'original' ? 'Original (3 / 6)' : 'Por rangos (3·4·5·6)'} · ${r.rate} m³/min·pers.</td></tr>
      </tbody></table>
      <table><thead><tr><th>Componente</th><th>Caudal (${u})</th><th>%</th></tr></thead><tbody>
        ${Object.entries(COMP).map(([k, m]) => `<tr><td>${m.name}</td><td class="n">${fmtU(r.components[k])}</td><td class="n">${fmt(r.subtotal ? r.components[k] / r.subtotal * 100 : 0, 0)} %</td></tr>`).join('')}
        <tr><td><b>Suma (sin FS)</b></td><td class="n"><b>${fmtU(r.subtotal)}</b></td><td></td></tr>
        <tr><td>Factor de seguridad</td><td class="n">${fmt(r.k, 2)}</td><td></td></tr>
      </tbody></table>
      <h2 class="report-chart-title">Distribución del caudal total requerido</h2>
      <p class="report-chart-note">Caudal de cada componente después de aplicar el factor de seguridad. Cada barra representa su participación en el total.</p>
      <div class="report-chart-wrap">
        <svg class="report-chart-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 270" role="img" aria-label="Gráfica de barras de caudal requerido por componente">
          <rect x="0" y="0" width="760" height="270" fill="#ffffff" />
          ${[0,25,50,75,100].map((v) => {
            const x = 190 + (v * 4.2);
            return `<line x1="${x}" y1="24" x2="${x}" y2="226" stroke="#d9e0e9" stroke-width="1"/><text x="${x}" y="249" fill="#475569" font-size="12" text-anchor="middle">${v}%</text>`;
          }).join('')}
          ${Object.entries(COMP).map(([k, m], i) => {
            const adjusted = r.components[k] * r.k;
            const pct = r.total > 0 ? Math.max(0, Math.min(100, (adjusted / r.total) * 100)) : 0;
            const width = pct * 4.2;
            const y = 35 + i * 49;
            const color = ({ trabajadores: '#0284c7', metano: '#0f9f91', voladura: '#d97706', maquinaria: '#7c3aed' })[k];
            return `<text x="176" y="${y + 17}" fill="#111827" font-size="14" font-weight="700" text-anchor="end">${m.name}</text><rect x="190" y="${y}" width="420" height="25" rx="6" fill="#edf1f6"/><rect x="190" y="${y}" width="${width}" height="25" rx="6" fill="${color}"/><text x="625" y="${y + 17}" fill="#111827" font-size="12" font-weight="600">${fmtU(adjusted)} ${u} · ${fmt(pct, 1)}%</text>`;
          }).join('')}
        </svg>
      </div>
      <div class="tot">Caudal total requerido: ${fmtU(r.total)} ${u}</div>
      <div class="foot">Generado con AERIQ v${VERSION}. Herramienta de apoyo: verificar coeficientes con la normativa vigente y el ingeniero responsable.</div>`;
    // Espera a que el navegador pinte el SVG antes de abrir el diálogo de impresión.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  });

  /* ---------- menú lateral plegable ---------- */
  const sidebarToggle = $('#sidebarToggle');
  function setSidebarCollapsed(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    if (sidebarToggle) {
      sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
      sidebarToggle.setAttribute('aria-label', collapsed ? 'Abrir menú de herramientas' : 'Cerrar menú de herramientas');
      sidebarToggle.title = collapsed ? 'Abrir menú de herramientas' : 'Cerrar menú de herramientas';
      sidebarToggle.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    }
    store.set('aeriq:sidebarCollapsed', collapsed);
  }
  setSidebarCollapsed(store.get('aeriq:sidebarCollapsed', false));
  sidebarToggle?.addEventListener('click', () => {
    setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
  });

  /* ---------- navegación ---------- */
  function show(v) {
    $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
    const module = ['calc','hist'].includes(v) ? 'calc' : v;
    $$('.tool-sidebar [data-module]').forEach(b => b.classList.toggle('active', b.dataset.module === module));
    $$('.subnav [data-subview]').forEach(b => b.classList.toggle('active', b.dataset.subview === v));
    document.body.classList.toggle('module-resistance', module === 'resistance');
    document.body.classList.toggle('module-editor', module === 'editor');
    if (v === 'hist') renderHist();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $$('.tool-sidebar [data-module]').forEach(b => b.addEventListener('click', () => show(b.dataset.module)));
  $$('.subnav [data-subview]').forEach(b => b.addEventListener('click', () => show(b.dataset.subview)));
  $$('.tool-sidebar button.coming').forEach(b => b.addEventListener('click', () => toast(`${b.dataset.coming}: próximamente`)));

  /* ---------- indicador visual de ventilación y conexión ---------- */
  const airflowStatus = $('#airflowStatus');
  const airflowLabel = $('#airflowLabel');
  function updateAirflowStatus() {
    const online = navigator.onLine;
    airflowStatus?.classList.toggle('offline', !online);
    if (airflowLabel) airflowLabel.textContent = online ? 'Flujo activo' : 'Sin conexión';
    if (airflowStatus) airflowStatus.setAttribute('aria-label', online ? 'Con conexión a internet' : 'Sin conexión a internet; AERIQ sigue disponible localmente');
  }
  window.addEventListener('online', updateAirflowStatus);
  window.addEventListener('offline', updateAirflowStatus);
  updateAirflowStatus();

  /* ---------- instalación PWA ---------- */
  let deferred;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
  $('#installBtn').addEventListener('click', async () => {
    if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('AERIQ instalada'); });
  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (isiOS && !standalone && !store.get('aeriq:iosHint', false)) $('#iosHint').hidden = false;
  $('#iosClose').addEventListener('click', () => { $('#iosHint').hidden = true; store.set('aeriq:iosHint', true); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  /* ---------- arranque ---------- */
  FIELD_IDS.forEach(id => { $('#f_' + id).value = (state.values && state.values[id]) || ''; });
  $('#nombre').value = state.nombre || '';
  $(`input[name=method][value=${state.method}]`).checked = true;
  $(`input[name=unit][value=${state.unit}]`).checked = true;
  $('#ver').textContent = VERSION;
  // La resistencia se inicializa en resistance.js; no llamar aquí a una función inexistente.
  update();

  const splash = $('#splash');
  const skip = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => { splash.classList.add('hide'); }, skip ? 300 : 1400);
  setTimeout(() => splash.remove(), skip ? 900 : 2000);

  // exposición mínima para pruebas
  window.__aeriq = { update };
})();
