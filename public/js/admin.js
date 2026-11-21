(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const reducirMovimiento = matchMedia('(prefers-reduced-motion: reduce)');
  const fmtFecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  const fecha = (v) => (v ? fmtFecha.format(new Date(v)) : '—');
  const ESTADO_TEXTO = { pendiente: 'Pendiente', validado: 'Validado', rechazado: 'Rechazado' };

  async function api(ruta, opciones = {}) {
    const resp = await fetch('/api/admin' + ruta, {
      credentials: 'same-origin',
      headers: opciones.body ? { 'Content-Type': 'application/json' } : {},
      ...opciones,
      body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    });
    if (resp.status === 401) {
      mostrarLogin();
      throw new Error('Tu sesión terminó. Vuelve a entrar.');
    }
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json.error || 'Ocurrió un error.');
    return json;
  }

  function el(tag, props = {}, ...hijos) {
    const nodo = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') nodo.className = v;
      else if (k === 'dataset') Object.assign(nodo.dataset, v);
      else if (k.startsWith('on')) nodo.addEventListener(k.slice(2), v);
      else nodo.setAttribute(k, v);
    });
    hijos.flat().forEach((h) => nodo.append(h instanceof Node ? h : document.createTextNode(h ?? '')));
    return nodo;
  }

  // ---------- Sesión ----------
  function mostrarLogin() {
    $('vista-panel').hidden = true;
    $('vista-login').hidden = false;
    $('usuario').focus();
  }

  async function mostrarPanel() {
    $('vista-login').hidden = true;
    $('vista-panel').hidden = false;
    const me = await api('/me');
    $('aviso-memoria').hidden = !me.enMemoria;
    if (!$('premio').value) $('premio').value = me.rifa.premio;
    $('tombola-premio').textContent = $('premio').value;
    activar('caja');
  }

  $('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('login-error').textContent = '';
    try {
      const resp = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: $('usuario').value.trim(), password: $('password').value }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.error || 'No se pudo entrar.');
      $('password').value = '';
      await mostrarPanel();
    } catch (err) {
      $('login-error').textContent = err.message;
    }
  });

  $('salir').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    mostrarLogin();
  });

  // ---------- Pestañas ----------
  const pestanas = [...window.SMClub.pestanas, 'registros', 'tombola', 'ganadores'];
  function activar(nombre, enfocar) {
    pestanas.forEach((p) => {
      const tab = $('tab-' + p);
      const activa = p === nombre;
      tab.setAttribute('aria-selected', String(activa));
      tab.tabIndex = activa ? 0 : -1;
      $('sec-' + p).hidden = !activa;
      if (activa && enfocar) tab.focus();
    });
    if (nombre === 'registros') { cargarStats(); cargarRegistros(); }
    if (nombre === 'tombola') { cargarStats(); prepararCarretes(); }
    if (nombre === 'ganadores') cargarGanadores();
    if (window.SMClub.pestanas.includes(nombre)) window.SMClub.activar(nombre);
  }
  pestanas.forEach((p, i) => {
    const tab = $('tab-' + p);
    tab.addEventListener('click', () => activar(p));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const siguiente = (i + (e.key === 'ArrowRight' ? 1 : -1) + pestanas.length) % pestanas.length;
      activar(pestanas[siguiente], true);
    });
  });

  // ---------- Estadísticas ----------
  let stats = {};
  async function cargarStats() {
    stats = await api('/stats');
    document.querySelectorAll('[data-stat]').forEach((n) => (n.textContent = stats[n.dataset.stat] ?? 0));
    $('participantes').textContent =
      stats.enTombola === 1 ? '1 ticket validado participa en la tómbola.' : `${stats.enTombola} tickets validados participan en la tómbola.`;
  }

  // ---------- Registros ----------
  let pagina = 1;
  let lista = [];
  let totalPaginas = 1;

  function parametros() {
    const p = new URLSearchParams();
    const q = $('buscar').value.trim();
    if (q) p.set('q', q);
    if ($('filtro-estado').value) p.set('estado', $('filtro-estado').value);
    return p;
  }

  async function cargarRegistros() {
    const p = parametros();
    p.set('pagina', pagina);
    const datos = await api('/registros?' + p);
    lista = datos.registros;
    totalPaginas = Math.max(1, Math.ceil(datos.total / datos.porPagina));
    $('resumen').textContent = datos.total === 1 ? '1 registro encontrado' : `${datos.total} registros encontrados`;
    $('pagina-texto').textContent = `Página ${pagina} de ${totalPaginas}`;
    $('anterior').disabled = pagina <= 1;
    $('siguiente').disabled = pagina >= totalPaginas;
    $('exportar').href = '/api/admin/export.csv?' + parametros();
    $('tbody').replaceChildren(...lista.map(fila));
  }

  function insignia(estado) {
    return el('span', { class: 'estado estado-' + estado }, ESTADO_TEXTO[estado] || estado);
  }

  function fila(r, i) {
    return el('tr', {},
      el('td', { class: 'num', 'data-label': 'Ticket' }, r.ticket),
      el('td', { 'data-label': 'Nombre' }, r.nombre),
      el('td', { class: 'num', 'data-label': 'Teléfono' }, r.telefono),
      el('td', { 'data-label': 'Registrado' }, fecha(r.creado_en)),
      el('td', { 'data-label': 'Estado' }, insignia(r.estado)),
      el('td', {},
        el('div', { class: 'acciones' },
          el('button', { class: 'btn btn-vidrio', type: 'button', onclick: () => abrirModal(i) }, 'Ver foto'),
          r.estado !== 'validado' ? el('button', { class: 'btn btn-verde', type: 'button', onclick: () => cambiarEstado(r, 'validado') }, 'Validar') : '',
          r.estado !== 'rechazado' ? el('button', { class: 'btn btn-rechazar', type: 'button', onclick: () => cambiarEstado(r, 'rechazado') }, 'Rechazar') : ''
        )
      )
    );
  }

  async function cambiarEstado(r, estado) {
    try {
      await api('/registros/' + r.id, { method: 'PATCH', body: { estado } });
      r.estado = estado;
      cargarStats();
      $('tbody').replaceChildren(...lista.map(fila));
    } catch (err) {
      alert(err.message);
    }
  }

  let temporizador;
  $('buscar').addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { pagina = 1; cargarRegistros(); }, 300);
  });
  $('filtros').addEventListener('submit', (e) => { e.preventDefault(); pagina = 1; cargarRegistros(); });
  $('filtro-estado').addEventListener('change', () => { pagina = 1; cargarRegistros(); });
  $('anterior').addEventListener('click', () => { if (pagina > 1) { pagina--; cargarRegistros(); } });
  $('siguiente').addEventListener('click', () => { if (pagina < totalPaginas) { pagina++; cargarRegistros(); } });

  // ---------- Modal de foto ----------
  const modal = $('modal');
  let indiceModal = -1;

  function abrirModal(i) {
    indiceModal = i;
    const r = lista[i];
    if (!r) return modal.close();
    const src = `/api/admin/registros/${r.id}/foto`;
    $('modal-titulo').textContent = 'Ticket ' + r.ticket;
    $('modal-datos').replaceChildren(`${r.nombre} · ${r.telefono} · `, insignia(r.estado));
    $('modal-img').src = src;
    $('modal-enlace').href = src;
    $('m-validar').disabled = r.estado === 'validado';
    $('m-rechazar').disabled = r.estado === 'rechazado';
    $('m-siguiente').disabled = i >= lista.length - 1;
    if (!modal.open) modal.showModal();
  }

  async function decidirEnModal(estado) {
    const r = lista[indiceModal];
    await cambiarEstado(r, estado);
    // Avanza al siguiente pendiente de la lista para revisar rápido.
    const siguiente = lista.findIndex((x, j) => j > indiceModal && x.estado === 'pendiente');
    if (siguiente >= 0) abrirModal(siguiente);
    else abrirModal(indiceModal);
  }

  $('m-validar').addEventListener('click', () => decidirEnModal('validado'));
  $('m-rechazar').addEventListener('click', () => decidirEnModal('rechazado'));
  $('m-siguiente').addEventListener('click', () => abrirModal(indiceModal + 1));
  $('cerrar-modal').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

  // ---------- Tómbola ----------
  let girando = false;

  function prepararCarretes(n = 6, caracter = '?') {
    if (girando) return;
    $('carretes').replaceChildren(...Array.from({ length: n }, () => el('div', { class: 'carrete' }, el('span', {}, caracter))));
  }

  $('premio').addEventListener('input', () => { $('tombola-premio').textContent = $('premio').value || '¡Gran sorteo!'; });

  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const digitoAzar = () => String(Math.floor(Math.random() * 10));

  async function animar(ticket) {
    const reducido = reducirMovimiento.matches;
    const carretes = ticket.split('').map(() => el('div', { class: 'carrete' + (reducido ? '' : ' girando') }, el('span', {}, reducido ? '•' : digitoAzar())));
    $('carretes').replaceChildren(...carretes);

    const intervalos = carretes.map((c) => (reducido ? null : setInterval(() => { c.firstChild.textContent = digitoAzar(); }, 70)));
    await espera(reducido ? 600 : 1600);

    for (let i = 0; i < carretes.length; i++) {
      clearInterval(intervalos[i]);
      const c = carretes[i];
      c.classList.remove('girando');
      c.firstChild.textContent = ticket[i];
      c.classList.add('listo');
      await espera(reducido ? 500 : i === carretes.length - 1 ? 900 : 650);
    }
  }

  function confeti() {
    if (reducirMovimiento.matches) return;
    const colores = ['#FFD200', '#FFFFFF', '#2E9E3E', '#FFE14D', '#9E0F14'];
    const capa = $('confeti');
    const piezas = Array.from({ length: 120 }, () => {
      const i = document.createElement('i');
      i.style.left = Math.random() * 100 + 'vw';
      i.style.background = colores[Math.floor(Math.random() * colores.length)];
      i.style.animationDuration = 2.2 + Math.random() * 2.4 + 's';
      i.style.animationDelay = Math.random() * 0.6 + 's';
      i.style.transform = `rotate(${Math.random() * 360}deg)`;
      return i;
    });
    capa.replaceChildren(...piezas);
    setTimeout(() => capa.replaceChildren(), 5500);
  }

  $('form-sorteo').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (girando) return;
    const premio = $('premio').value.trim();
    $('sorteo-error').textContent = '';
    if (!premio) {
      $('sorteo-error').textContent = 'Escribe qué premio se va a sortear.';
      $('premio').focus();
      return;
    }
    girando = true;
    $('girar').disabled = true;
    $('ganador').hidden = true;
    $('anuncio').textContent = 'Girando la tómbola…';
    try {
      const { ganador } = await api('/sorteo', { method: 'POST', body: { premio, sacar: $('sacar').checked } });
      $('tombola-premio').textContent = ganador.premio;
      await animar(ganador.ticket);
      $('ganador-nombre').textContent = ganador.nombre;
      $('ganador-tel').textContent = ganador.telefono;
      $('ganador').hidden = false;
      $('anuncio').textContent = `Ganador de ${ganador.premio}: ticket ${ganador.ticket.split('').join(' ')}, ${ganador.nombre}.`;
      confeti();
      cargarStats();
    } catch (err) {
      $('sorteo-error').textContent = err.message;
      $('anuncio').textContent = '';
    } finally {
      girando = false;
      $('girar').disabled = false;
    }
  });

  $('pantalla-completa').addEventListener('click', () => {
    const t = $('tombola');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (t.requestFullscreen) t.requestFullscreen();
  });
  document.addEventListener('fullscreenchange', () => {
    $('pantalla-completa').textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
  });

  // ---------- Ganadores ----------
  async function cargarGanadores() {
    const { ganadores } = await api('/ganadores');
    $('sin-ganadores').hidden = ganadores.length > 0;
    $('tbody-ganadores').replaceChildren(...ganadores.map((g) => {
      const tel = el('span', { class: 'num' }, g.telefonoOculto);
      const ver = el('button', {
        class: 'btn btn-vidrio', type: 'button', 'aria-pressed': 'false',
        onclick: () => {
          const mostrar = ver.getAttribute('aria-pressed') !== 'true';
          ver.setAttribute('aria-pressed', String(mostrar));
          tel.textContent = mostrar ? g.telefono : g.telefonoOculto;
          ver.textContent = mostrar ? 'Ocultar teléfono' : 'Ver teléfono';
        },
      }, 'Ver teléfono');
      const regresar = el('button', {
        class: 'btn btn-vidrio', type: 'button',
        onclick: async () => {
          if (!confirm(`¿Regresar el ticket ${g.ticket} a la tómbola? El historial se conserva.`)) return;
          try {
            await api(`/registros/${g.registro_id}/tombola`, { method: 'POST', body: { enTombola: true } });
            regresar.disabled = true;
            regresar.textContent = 'De vuelta en la tómbola';
          } catch (err) { alert(err.message); }
        },
      }, 'Regresar a la tómbola');
      return el('tr', {},
        el('td', { 'data-label': 'Premio' }, el('strong', {}, g.premio)),
        el('td', { class: 'num', 'data-label': 'Ticket' }, g.ticket),
        el('td', { 'data-label': 'Nombre' }, g.nombre),
        el('td', { 'data-label': 'Teléfono' }, tel),
        el('td', { 'data-label': 'Fecha' }, fecha(g.sorteado_en)),
        el('td', {}, el('div', { class: 'acciones' }, ver, g.registro_id ? regresar : ''))
      );
    }));
  }

  // ---------- Inicio ----------
  api('/me').then(mostrarPanel).catch(mostrarLogin);
})();
