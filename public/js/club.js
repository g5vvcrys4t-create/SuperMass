(() => {
  'use strict';
  const { cfg, $, api, el, num, tel, fecha, soloNumeros, marcar, listo } = window.SM;
  const club = cfg.club;
  const params = new URLSearchParams(location.search);
  const ref = (params.get('ref') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

  ['a-telefono', 'e-telefono'].forEach((id) => soloNumeros($(id), 10));
  ['a-pin', 'e-pin'].forEach((id) => soloNumeros($(id), 4));

  // Cumpleaños
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  for (let d = 1; d <= 31; d++) $('a-dia').append(el('option', { value: String(d).padStart(2, '0') }, String(d)));
  MESES.forEach((m, i) => $('a-mes').append(el('option', { value: String(i + 1).padStart(2, '0') }, m)));

  if (ref) {
    $('aviso-ref').hidden = false;
    $('aviso-ref').textContent = `🎁 Te invitó un vecino. Al hacer tu primera compra ganan ${club.referido} puntos cada uno.`;
  }

  // ---------- Pestañas acceso ----------
  function pestana(cual) {
    const alta = cual === 'alta';
    $('tab-alta').setAttribute('aria-selected', String(alta));
    $('tab-entrar').setAttribute('aria-selected', String(!alta));
    $('tab-alta').tabIndex = alta ? 0 : -1;
    $('tab-entrar').tabIndex = alta ? -1 : 0;
    $('form-alta').hidden = !alta;
    $('form-entrar').hidden = alta;
  }
  $('tab-alta').addEventListener('click', () => pestana('alta'));
  $('tab-entrar').addEventListener('click', () => pestana('entrar'));
  [$('tab-alta'), $('tab-entrar')].forEach((t) => t.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const otra = t.id === 'tab-alta' ? 'entrar' : 'alta';
      pestana(otra);
      $('tab-' + otra).focus();
    }
  }));

  const cargando = (btn, si) => { btn.disabled = si; btn.classList.toggle('cargando', si); };

  // ---------- Alta ----------
  $('form-alta').addEventListener('submit', async (e) => {
    e.preventDefault();
    ['a-nombre', 'a-telefono', 'a-pin', 'a-privacidad'].forEach((c) => marcar(c, ''));
    $('a-error').textContent = '';
    const datos = {
      nombre: $('a-nombre').value.trim(),
      telefono: $('a-telefono').value,
      pin: $('a-pin').value,
      cumple: $('a-dia').value && $('a-mes').value ? `${$('a-mes').value}-${$('a-dia').value}` : '',
      privacidad: $('a-privacidad').checked ? 'si' : '',
      sitio: $('form-alta').sitio.value,
      ref,
    };
    if (datos.nombre.length < 3) return marcar('a-nombre', 'Escribe tu nombre.');
    if (datos.telefono.length !== 10) return marcar('a-telefono', 'Tu celular debe tener 10 dígitos.');
    if (datos.pin.length !== 4) return marcar('a-pin', 'Tu NIP son 4 números.');
    if (!datos.privacidad) return marcar('a-privacidad', 'Necesitas aceptar el aviso de privacidad.');

    cargando($('a-enviar'), true);
    try {
      const r = await api('/club/registro', { method: 'POST', body: datos });
      await cargar();
      if (r.nuevo) {
        modal('¡Ya eres del Club!', [
          el('p', {}, `Ya tienes ${num(r.socio.puntos)} puntos de regalo.`),
          el('p', {}, 'En tu próxima compra di tu celular en caja y empieza a sumar.'),
        ], [el('button', { class: 'btn btn-amarillo', type: 'button', onclick: cerrarModal }, '¡Va!')]);
      }
    } catch (err) {
      if (err.yaExiste) {
        pestana('entrar');
        $('e-telefono').value = datos.telefono;
        marcar('e-pin', 'Ese celular ya tiene tarjeta. Escribe tu NIP.');
      } else if (err.campo) marcar('a-' + err.campo, err.message);
      else $('a-error').textContent = err.message;
    } finally {
      cargando($('a-enviar'), false);
    }
  });

  // ---------- Entrar ----------
  $('form-entrar').addEventListener('submit', async (e) => {
    e.preventDefault();
    ['e-telefono', 'e-pin'].forEach((c) => marcar(c, ''));
    $('e-error').textContent = '';
    const telefono = $('e-telefono').value;
    const pin = $('e-pin').value;
    if (telefono.length !== 10) return marcar('e-telefono', 'Tu celular debe tener 10 dígitos.');
    if (pin.length !== 4) return marcar('e-pin', 'Tu NIP son 4 números.');
    cargando($('e-enviar'), true);
    try {
      await api('/club/entrar', { method: 'POST', body: { telefono, pin } });
      $('e-pin').value = '';
      await cargar();
    } catch (err) {
      if (err.activar) {
        pestana('alta');
        $('a-telefono').value = telefono;
        if (err.nombre) $('a-nombre').value = err.nombre;
        $('a-error').textContent = '';
        marcar('a-pin', 'Tu tarjeta se creó en caja. Crea tu NIP para activarla.');
      } else if (err.campo) marcar('e-' + err.campo, err.message);
      else $('e-error').textContent = err.message;
    } finally {
      cargando($('e-enviar'), false);
    }
  });

  // ---------- Vista del socio ----------
  const TIPO = { compra: 'Compra', bono: 'Regalo', canje: 'Canje', referido: 'Invitación', opinion: 'Opinión', ajuste: 'Ajuste', devolucion: 'Devolución' };

  function pintar(d) {
    const s = d.socio;
    $('s-nivel').textContent = s.nivel.nombre;
    $('s-puntos').textContent = num(s.puntos);
    $('s-nombre').textContent = s.nombre;
    $('s-tel').textContent = tel(s.telefono);
    $('s-tel2').textContent = tel(s.telefono);
    $('m-compras').textContent = num(s.compras);
    $('m-historicos').textContent = num(s.historicos);
    $('m-invitados').textContent = num(d.invitados);
    $('p-cumple').hidden = !s.mesCumple;

    const primerNombre = s.nombre.split(' ')[0];
    if (s.siguiente) {
      const actualDesde = club.niveles.find((n) => n.id === s.nivel.id).desde;
      const avance = (s.historicos - actualDesde) / (s.siguiente.desde - actualDesde);
      $('p-titulo').textContent = `¡Hola, ${primerNombre}! Eres ${s.nivel.nombre}`;
      $('p-texto').textContent = `Te faltan ${num(s.siguiente.faltan)} puntos para ser ${s.siguiente.nombre} y ganar más en cada compra.`;
      requestAnimationFrame(() => { $('p-barra').style.width = Math.max(4, Math.min(100, avance * 100)) + '%'; });
    } else {
      $('p-titulo').textContent = `¡Hola, ${primerNombre}! Eres ${s.nivel.nombre}`;
      $('p-texto').textContent = 'Estás en el nivel más alto: 50% más puntos y envío gratis. ¡Gracias por tu preferencia!';
      requestAnimationFrame(() => { $('p-barra').style.width = '100%'; });
    }

    // Códigos pendientes
    const pendientes = d.canjes.filter((c) => c.estado === 'pendiente');
    $('bloque-codigos').hidden = !pendientes.length;
    $('codigos').replaceChildren(...pendientes.map((c) =>
      el('div', { class: 'codigo-card vidrio' },
        el('div', {}, el('strong', {}, c.nombre), el('br'), el('small', { class: 'ayuda' }, fecha(c.creado_en))),
        el('span', { class: 'codigo', 'aria-label': 'Código ' + c.codigo.split('').join(' ') }, c.codigo)
      )
    ));

    // Premios
    $('premios-socio').replaceChildren(...club.recompensas.map((r) => {
      const alcanza = s.puntos >= r.puntos;
      return el('article', { class: 'vidrio premio-card' + (alcanza ? '' : ' bloqueado') },
        el('span', { class: 'premio-pts' }, num(r.puntos), ' ', el('small', {}, 'pts')),
        el('h3', {}, r.nombre),
        el('p', {}, r.detalle),
        alcanza
          ? el('button', { class: 'btn btn-amarillo', type: 'button', onclick: () => confirmarCanje(r) }, 'Canjear')
          : el('span', { class: 'equiv' }, `Te faltan ${num(r.puntos - s.puntos)} puntos`)
      );
    }));

    // Invitación
    const url = `${cfg.baseUrl}/club?ref=${s.codigo}`;
    $('ref-url').value = url;
    $('invitar-wa').href = 'https://wa.me/?text=' + encodeURIComponent(
      `¡Vecino! Únete gratis al Club SuperMass y te regalan ${club.bienvenida} puntos. En tu primera compra ganamos ${club.referido} puntos cada uno 🛒 ${url}`
    );

    // Tickets subidos
    const ESTADO_TK = { pendiente: '⏳ En revisión', aprobado: '✓ Aprobado', rechazado: '✕ Rechazado' };
    $('mis-tickets').hidden = !(d.tickets && d.tickets.length);
    $('lista-tickets').replaceChildren(...(d.tickets || []).map((t) =>
      el('li', {},
        el('div', {}, el('span', {}, `Ticket ${t.folio} · ${window.SM.pesos(t.monto)}`),
          el('small', {}, `${ESTADO_TK[t.estado] || t.estado} · ${fecha(t.creado_en)}${t.estado === 'rechazado' && t.motivo ? ' · ' + t.motivo : ''}`)),
        el('span', { class: t.estado === 'aprobado' ? 'mas' : 'menos' }, t.estado === 'aprobado' ? `+${num(t.puntos)} pts` : t.estado === 'pendiente' ? '…' : '—')
      )
    ));
    socioActual = s;

    // Historial
    $('historial').replaceChildren(...(d.movimientos.length ? d.movimientos.map((m) =>
      el('li', {},
        el('div', {}, el('span', {}, m.nota || TIPO[m.tipo] || m.tipo), el('small', {}, `${TIPO[m.tipo] || ''} · ${fecha(m.creado_en)}${m.monto ? ' · ' + window.SM.pesos(m.monto) : ''}`)),
        el('span', { class: m.puntos >= 0 ? 'mas' : 'menos' }, (m.puntos > 0 ? '+' : '') + num(m.puntos) + ' pts')
      )
    ) : [el('li', {}, 'Aún no tienes movimientos.')]));
  }

  async function cargar() {
    try {
      const d = await api('/club/yo');
      if (!d.socio) throw new Error('sin sesión');
      pintar(d);
      $('vista-acceso').hidden = true;
      $('vista-socio').hidden = false;
      const btn = $('nav-tarjeta');
      btn.replaceChildren(el('span', {}, d.socio.nombre.split(' ')[0]), el('span', { class: 'pts' }, `${num(d.socio.puntos)} pts`));
    } catch {
      $('vista-socio').hidden = true;
      $('vista-acceso').hidden = false;
      if (params.get('entrar') !== null) pestana('entrar');
    } finally {
      $('cargando').hidden = true;
    }
  }

  // ---------- Canje ----------
  function confirmarCanje(r) {
    modal(`¿Canjear ${r.nombre}?`, [
      el('p', {}, `Se descontarán ${num(r.puntos)} puntos. Te daremos un código para recoger tu premio en caja.`),
    ], [
      el('button', { class: 'btn btn-amarillo', type: 'button', onclick: (e) => canjear(r, e.currentTarget) }, `Sí, canjear por ${num(r.puntos)} pts`),
      el('button', { class: 'btn btn-vidrio', type: 'button', onclick: cerrarModal }, 'Cancelar'),
    ]);
  }

  async function canjear(r, btn) {
    btn.disabled = true;
    try {
      const res = await api('/club/canjear', { method: 'POST', body: { recompensa: r.id } });
      await cargar();
      modal('¡Listo! Tu premio te espera', [
        el('p', {}, `Muestra este código en caja para recoger tu ${r.nombre.toLowerCase()}:`),
        el('p', {}, el('span', { class: 'codigo' }, res.codigo)),
        el('p', {}, 'También lo encuentras en «Tus premios por recoger».'),
      ], [el('button', { class: 'btn btn-amarillo', type: 'button', onclick: cerrarModal }, 'Entendido')]);
    } catch (err) {
      modal('No se pudo canjear', [el('p', {}, err.message)], [el('button', { class: 'btn btn-amarillo', type: 'button', onclick: cerrarModal }, 'Cerrar')]);
    }
  }

  // ---------- Modal ----------
  function modal(titulo, cuerpo, acciones) {
    $('modal-titulo').textContent = titulo;
    $('modal-cuerpo').replaceChildren(...cuerpo);
    $('modal-acciones').replaceChildren(...acciones);
    if (!$('modal').open) $('modal').showModal();
  }
  function cerrarModal() { $('modal').close(); }

  // ---------- Registrar ticket ----------
  let socioActual = null;
  let fotoTicket = null;
  let urlFoto = null;

  $('t-monto').addEventListener('input', () => {
    const m = Number($('t-monto').value.replace(/[^\d.]/g, ''));
    if (!m || !socioActual) { $('t-monto-ayuda').textContent = ''; return; }
    const mult = socioActual.nivel.multiplicador * (socioActual.mesCumple ? club.cumpleMultiplicador : 1);
    $('t-monto-ayuda').textContent = `Ganarías ${num(Math.floor(Math.floor(m / club.pesosPorPunto) * mult))} puntos.`;
  });

  // Reduce la foto en el celular antes de subirla (más rápido con datos móviles)
  async function reducir(archivo) {
    try {
      const img = await createImageBitmap(archivo);
      const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise((ok) => c.toBlob((b) => ok(b || archivo), 'image/jpeg', 0.82));
    } catch { return archivo; }
  }

  ['t-camara', 't-galeria'].forEach((id) => $(id).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    marcar('t-foto', '');
    fotoTicket = await reducir(f);
    if (urlFoto) URL.revokeObjectURL(urlFoto);
    urlFoto = URL.createObjectURL(fotoTicket);
    $('t-img').src = urlFoto;
    $('t-preview').hidden = false;
    $('t-botones').hidden = true;
  }));
  $('t-quitar').addEventListener('click', () => {
    fotoTicket = null;
    $('t-preview').hidden = true;
    $('t-botones').hidden = false;
    $('t-camara').value = '';
    $('t-galeria').value = '';
  });

  $('form-ticket').addEventListener('submit', async (e) => {
    e.preventDefault();
    ['t-folio', 't-monto', 't-foto'].forEach((c) => marcar(c, ''));
    $('t-error').textContent = '';
    $('t-ok').hidden = true;
    const folio = $('t-folio').value.trim();
    const monto = $('t-monto').value.trim();
    if (folio.length < 3) return marcar('t-folio', 'Escribe el folio de tu ticket.');
    if (!Number(monto.replace(/[^\d.]/g, ''))) return marcar('t-monto', 'Escribe el total que pagaste.');
    if (!fotoTicket) return marcar('t-foto', 'Toma o sube la foto de tu ticket.');

    const datos = new FormData();
    datos.append('folio', folio);
    datos.append('monto', monto);
    datos.append('foto', fotoTicket, 'ticket.jpg');
    cargando($('t-enviar'), true);
    try {
      const resp = await fetch('/api/club/ticket', { method: 'POST', body: datos, credentials: 'same-origin' });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw Object.assign(new Error(json.error || 'No se pudo enviar.'), json);
      $('form-ticket').reset();
      $('t-quitar').click();
      $('t-monto-ayuda').textContent = '';
      $('t-ok').hidden = false;
      $('t-ok').textContent = `✓ ¡Recibido! Revisamos tu ticket ${json.folio} y te sumamos unos ${num(json.puntosEstimados)} puntos en cuanto lo aprobemos.`;
      await cargar();
    } catch (err) {
      if (err.campo) marcar('t-' + err.campo, err.message);
      else $('t-error').textContent = err.message;
    } finally {
      cargando($('t-enviar'), false);
    }
  });

  // ---------- Otros ----------
  $('copiar').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('ref-url').value); } catch { $('ref-url').select(); document.execCommand('copy'); }
    $('copiar').textContent = '¡Copiado!';
    setTimeout(() => { $('copiar').textContent = 'Copiar'; }, 1800);
  });

  $('salir').addEventListener('click', async () => {
    await api('/club/salir', { method: 'POST' }).catch(() => {});
    location.href = '/club';
  });

  listo.then(cargar);
})();
