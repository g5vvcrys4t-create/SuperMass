// Utilidades compartidas por las páginas del Club SuperMass.
window.SM = (() => {
  'use strict';
  const cfgEl = document.getElementById('config');
  const cfg = cfgEl ? JSON.parse(cfgEl.textContent || '{}') : {};
  const $ = (id) => document.getElementById(id);

  const fmtPesos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  const pesos = (centavos) => fmtPesos.format(centavos / 100);
  const num = (n) => new Intl.NumberFormat('es-MX').format(n);
  const tel = (t) => (t ? `${t.slice(0, 2)} ${t.slice(2, 6)} ${t.slice(6)}` : '');
  const fmtFecha = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const fecha = (v) => (v ? fmtFecha.format(new Date(v)) : '');

  async function api(ruta, opciones = {}) {
    const resp = await fetch('/api' + ruta, {
      credentials: 'same-origin',
      headers: opciones.body ? { 'Content-Type': 'application/json' } : {},
      ...opciones,
      body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(json.error || 'No pudimos conectar. Revisa tu internet e intenta de nuevo.');
      Object.assign(err, json, { status: resp.status });
      throw err;
    }
    return json;
  }

  function el(tag, props = {}, ...hijos) {
    const nodo = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') nodo.className = v;
      else if (k.startsWith('on')) nodo.addEventListener(k.slice(2), v);
      else nodo.setAttribute(k, v === true ? '' : v);
    });
    hijos.flat().forEach((h) => h != null && nodo.append(h instanceof Node ? h : document.createTextNode(h)));
    return nodo;
  }

  // Solo dígitos mientras escriben
  function soloNumeros(input, max) {
    input.addEventListener('input', () => {
      const limpio = input.value.replace(/\D/g, '').slice(0, max);
      if (limpio !== input.value) input.value = limpio;
    });
  }

  function marcar(id, mensaje) {
    const err = $(id + '-error');
    if (err) err.textContent = mensaje || '';
    const input = $(id);
    if (input && 'setAttribute' in input) input.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
    if (mensaje && input && input.focus) input.focus();
  }

  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
  const leer = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };

  // Estado del socio para la barra superior
  let socio = null;
  const listo = api('/club/yo')
    .then((d) => { socio = d.socio || null; return d; })
    .catch(() => null)
    .then((d) => {
      const btn = $('nav-tarjeta');
      if (btn && socio) {
        btn.replaceChildren(
          el('span', {}, socio.nombre.split(' ')[0]),
          el('span', { class: 'pts' }, `${num(socio.puntos)} pts`)
        );
        btn.setAttribute('aria-label', `Mi tarjeta: ${socio.puntos} puntos`);
      }
      return d;
    });

  // WhatsApp flotante: se oculta si la tienda no configuró número
  document.querySelectorAll('[data-solo-whatsapp]').forEach((n) => { n.hidden = !cfg.whatsapp; });

  return { cfg, $, api, el, pesos, num, tel, fecha, soloNumeros, marcar, guardar, leer, listo, get socio() { return socio; } };
})();
