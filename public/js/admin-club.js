// Panel: Caja, Pedidos, Socios, Productos y Buzón del Club SuperMass.
window.SMClub = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const fmtPesos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  const pesos = (c) => fmtPesos.format((c || 0) / 100);
  const num = (n) => new Intl.NumberFormat('es-MX').format(n || 0);
  const tel = (t) => (t ? `${t.slice(0, 2)} ${t.slice(2, 6)} ${t.slice(6)}` : '');
  const fmtFecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  const fecha = (v) => (v ? fmtFecha.format(new Date(v)) : '—');
  const wa = (t, texto = '') => `https://wa.me/52${t}${texto ? '?text=' + encodeURIComponent(texto) : ''}`;

  async function api(ruta, opciones = {}) {
    const resp = await fetch('/api/admin' + ruta, {
      credentials: 'same-origin',
      headers: opciones.body ? { 'Content-Type': 'application/json' } : {},
      ...opciones,
      body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    });
    const json = await resp.json().catch(() => ({}));
    if (resp.status === 401) { location.reload(); throw new Error('Sesión terminada.'); }
    if (!resp.ok) throw new Error(json.error || 'Ocurrió un error.');
    return json;
  }

  function el(tag, props = {}, ...hijos) {
    const nodo = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') nodo.className = v;
      else if (k.startsWith('on')) nodo.addEventListener(k.slice(2), v);
      else if (k === 'checked' || k === 'value') nodo[k] = v;
      else nodo.setAttribute(k, v === true ? '' : v);
    });
    hijos.flat().forEach((h) => h != null && nodo.append(h instanceof Node ? h : document.createTextNode(h)));
    return nodo;
  }

  const digitos = (input, max) => input.addEventListener('input', () => {
    const v = input.value.replace(/\D/g, '').slice(0, max);
    if (v !== input.value) input.value = v;
  });

  // ================= Resumen e insignias =================
  async function resumen() {
    try {
      const r = await api('/club/resumen');
      document.querySelectorAll('[data-club]').forEach((n) => {
        const k = n.dataset.club;
        n.textContent = k === 'ventas7' ? fmtPesos.format(r[k] / 100).replace(/\.\d+$/, '') : num(r[k]);
      });
      const bp = $('badge-pedidos');
      bp.hidden = !r.pedidosNuevos;
      bp.textContent = r.pedidosNuevos;
      const bb = $('badge-buzon');
      bb.hidden = !r.opinionesAbiertas;
      bb.textContent = r.opinionesAbiertas;
      if (r.pedidosNuevos > ultimosNuevos && ultimosNuevos >= 0) avisar(`🛒 ${r.pedidosNuevos} pedido(s) nuevo(s)`);
      ultimosNuevos = r.pedidosNuevos;
    } catch { /* silencioso */ }
  }
  let ultimosNuevos = -1;
  function avisar(texto) {
    document.title = texto + ' · Panel SuperMass';
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.25);
    } catch { /* sin audio */ }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = 'Panel · SuperMass'; });

  // ================= Caja =================
  let socioCaja = null;
  digitos($('c-tel'), 10);

  function limpiarCaja() {
    $('caja-error').textContent = '';
    $('caja-ok').hidden = true;
  }

  async function buscar(telefono) {
    limpiarCaja();
    if (!/^\d{10}$/.test(telefono)) { $('caja-error').textContent = 'Escribe el celular a 10 dígitos.'; return; }
    try {
      const r = await api('/club/socio?telefono=' + telefono);
      socioCaja = r.socio;
      $('caja-socio').hidden = !r.socio;
      $('caja-alta').hidden = !!r.socio;
      if (!r.socio) { $('c-nombre').value = ''; $('c-nombre').focus(); return; }
      pintarSocio(r.socio, r.canjes);
      $('c-monto').value = '';
      $('c-folio').value = '';
      $('c-preview').textContent = '';
      $('c-monto').focus();
    } catch (err) { $('caja-error').textContent = err.message; }
  }

  function pintarSocio(s, canjes) {
    $('cs-nombre').textContent = s.nombre;
    $('cs-detalle').textContent = `${s.nivel.nombre} · ${tel(s.telefono)} · ${num(s.compras)} compras${s.activado ? '' : ' · sin NIP aún'}`;
    $('cs-puntos').textContent = num(s.puntos);
    $('cs-cumple').hidden = !s.mesCumple;
    $('cs-canjes').replaceChildren(...(canjes && canjes.length ? [
      el('h3', {}, 'Premios por entregar'),
      ...canjes.map((c) => el('div', { class: 'canje-pend' },
        el('span', {}, el('strong', {}, c.nombre), ' · código ', el('strong', {}, c.codigo)),
        el('span', { class: 'acciones' },
          el('button', { class: 'btn btn-verde', type: 'button', onclick: () => entregar(c.codigo) }, 'Entregar'),
          el('button', { class: 'btn btn-rechazar', type: 'button', onclick: () => cancelarCanje(c) }, 'Cancelar')
        )
      )),
    ] : []));
  }

  $('f-buscar').addEventListener('submit', (e) => { e.preventDefault(); buscar($('c-tel').value); });

  $('c-monto').addEventListener('input', () => {
    if (!socioCaja) return;
    const m = Number($('c-monto').value.replace(/[^\d.]/g, ''));
    const base = Math.floor(m / 10);
    const mult = socioCaja.nivel.multiplicador * (socioCaja.mesCumple ? 2 : 1);
    $('c-preview').textContent = m ? `Ganará ${num(Math.floor(base * mult))} puntos${mult > 1 ? ` (x${mult})` : ''}.` : '';
  });

  $('f-compra').addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarCaja();
    const btn = $('c-sumar');
    btn.disabled = true;
    try {
      const r = await api('/club/compra', { method: 'POST', body: { telefono: socioCaja.telefono, monto: $('c-monto').value, folio: $('c-folio').value } });
      socioCaja = r.socio;
      pintarSocio(r.socio, null);
      $('caja-ok').hidden = false;
      $('caja-ok').textContent = `✓ +${num(r.puntos)} puntos para ${r.socio.nombre.split(' ')[0]}. Ahora tiene ${num(r.socio.puntos)}.` +
        (r.referido ? ' 🎁 Además se pagó el bono de invitación.' : '') +
        (r.socio.siguiente ? ` Le faltan ${num(r.socio.siguiente.faltan)} para ${r.socio.siguiente.nombre}.` : '');
      $('c-monto').value = '';
      $('c-folio').value = '';
      $('c-preview').textContent = '';
      // Lista para el siguiente cliente
      $('c-tel').value = '';
      $('c-tel').focus();
      resumen();
    } catch (err) { $('caja-error').textContent = err.message; }
    finally { btn.disabled = false; }
  });

  $('caja-alta').addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarCaja();
    try {
      const r = await api('/club/socios', { method: 'POST', body: { telefono: $('c-tel').value, nombre: $('c-nombre').value } });
      socioCaja = r.socio;
      $('caja-alta').hidden = true;
      $('caja-socio').hidden = false;
      pintarSocio(r.socio, []);
      $('caja-ok').hidden = false;
      $('caja-ok').textContent = `✓ Tarjeta creada con ${num(r.socio.puntos)} puntos de regalo. Ahora suma su compra.`;
      $('c-monto').focus();
      resumen();
    } catch (err) { $('caja-error').textContent = err.message; }
  });

  async function entregar(codigo) {
    const msg = $('codigo-msg');
    msg.className = '';
    msg.textContent = '';
    try {
      const r = await api('/club/canjes/entregar', { method: 'POST', body: { codigo } });
      msg.className = 'ok';
      msg.textContent = `✓ Entrega: ${r.recompensa} a ${r.socio} (${tel(r.telefono)}).`;
      $('c-codigo').value = '';
      if (socioCaja) buscar(socioCaja.telefono);
    } catch (err) {
      msg.className = 'mal';
      msg.textContent = err.message;
    }
  }
  $('f-codigo').addEventListener('submit', (e) => { e.preventDefault(); entregar($('c-codigo').value.trim()); });

  async function cancelarCanje(c) {
    if (!confirm(`¿Cancelar el canje de ${c.nombre}? Se le regresan ${c.puntos} puntos.`)) return;
    try {
      await api(`/club/canjes/${c.id}/cancelar`, { method: 'POST' });
      if (socioCaja) buscar(socioCaja.telefono);
    } catch (err) { alert(err.message); }
  }

  // ================= Pedidos =================
  const SIGUIENTE = { nuevo: 'preparando', preparando: 'en camino', 'en camino': 'entregado' };
  const ETIQUETA = { nuevo: 'Nuevo', preparando: 'Preparando', 'en camino': 'En camino', entregado: 'Entregado', cancelado: 'Cancelado' };

  async function pedidos() {
    try {
      const filtro = $('p-filtro').value;
      const r = await api('/pedidos' + (filtro ? '?estado=' + encodeURIComponent(filtro) : ''));
      $('lista-pedidos').replaceChildren(...(r.pedidos.length ? r.pedidos.map(tarjetaPedido) : [el('p', { class: 'resumen' }, 'No hay pedidos aquí.')]));
    } catch (err) { $('lista-pedidos').replaceChildren(el('p', { class: 'error' }, err.message)); }
  }

  function tarjetaPedido(p) {
    const total = p.subtotal + p.envio;
    const avanzar = SIGUIENTE[p.estado];
    const cambiar = async (estado) => {
      const body = { estado };
      if (estado === 'entregado') {
        const v = prompt(`¿Cuánto se cobró al final? (para sumar puntos)\nTotal estimado: ${pesos(total)}`, (total / 100).toFixed(2));
        if (v === null) return;
        body.cobrado = Number(String(v).replace(/[^\d.]/g, '')) || 0;
      }
      if (estado === 'cancelado' && !confirm(`¿Cancelar el pedido ${p.folio}?`)) return;
      try {
        const r = await api('/pedidos/' + p.id, { method: 'PATCH', body });
        if (r.puntos) alert(`Pedido entregado. Se sumaron ${r.puntos} puntos a ${p.nombre.split(' ')[0]}.`);
        pedidos();
        resumen();
      } catch (err) { alert(err.message); }
    };
    return el('article', { class: 'item' + (p.estado === 'nuevo' ? ' nuevo' : '') },
      el('div', { class: 'item-cabeza' },
        el('strong', {}, p.folio),
        el('span', { class: 'etq etq-' + p.estado.replace(' ', '-') }, ETIQUETA[p.estado])
      ),
      el('small', {}, fecha(p.creado_en)),
      el('p', {}, el('strong', {}, p.nombre), ' · ', el('a', { href: wa(p.telefono, `Hola ${p.nombre.split(' ')[0]}, te escribimos de SuperMass por tu pedido ${p.folio}.`), target: '_blank', rel: 'noopener' }, tel(p.telefono)), p.socio_id ? ' · ⭐ socio' : ''),
      el('p', {}, p.entrega === 'domicilio' ? `🛵 ${p.direccion}` : '🏪 Pasa a recoger', ` · 💳 ${p.pago}`),
      p.items.length ? el('ul', {}, p.items.map((i) => el('li', {}, `${i.cantidad} × ${i.nombre} — ${pesos(i.precio * i.cantidad)}`))) : null,
      p.extra ? el('p', {}, '📝 ', p.extra) : null,
      p.notas ? el('p', {}, el('small', {}, 'Notas: ', p.notas)) : null,
      el('p', {}, el('strong', {}, `Total aprox. ${pesos(total)}`), p.envio ? el('small', {}, ` (envío ${pesos(p.envio)})`) : null, p.puntos_dados ? el('small', {}, ` · puntos sumados`) : null),
      el('div', { class: 'acciones' },
        avanzar ? el('button', { class: 'btn btn-verde', type: 'button', onclick: () => cambiar(avanzar) }, `→ ${ETIQUETA[avanzar]}`) : null,
        p.estado !== 'entregado' && p.estado !== 'cancelado' ? el('button', { class: 'btn btn-rechazar', type: 'button', onclick: () => cambiar('cancelado') }, 'Cancelar') : null
      )
    );
  }
  $('p-filtro').addEventListener('change', pedidos);

  // ================= Socios =================
  let tSocios;
  async function socios() {
    try {
      const q = $('s-buscar').value.trim();
      const r = await api('/club/socios' + (q ? '?q=' + encodeURIComponent(q) : ''));
      $('tbody-socios').replaceChildren(...(r.socios.length ? r.socios.map((s) => el('tr', {},
        el('td', { 'data-label': 'Nombre' }, el('strong', {}, s.nombre), s.activado ? null : el('small', {}, ' (sin NIP)')),
        el('td', { 'data-label': 'Celular' }, el('a', { href: wa(s.telefono), target: '_blank', rel: 'noopener' }, tel(s.telefono))),
        el('td', { 'data-label': 'Nivel' }, s.nivel),
        el('td', { class: 'num', 'data-label': 'Puntos' }, num(s.puntos)),
        el('td', { 'data-label': 'Compras' }, num(s.compras)),
        el('td', { 'data-label': 'Última compra' }, fecha(s.ultima_compra)),
        el('td', {}, el('div', { class: 'acciones' },
          el('button', { class: 'btn btn-vidrio', type: 'button', onclick: () => ajustar(s) }, 'Ajustar puntos'),
          s.activado ? el('button', { class: 'btn btn-vidrio', type: 'button', onclick: () => reiniciarNip(s) }, 'Reiniciar NIP') : null
        ))
      )) : [el('tr', {}, el('td', { colspan: '7' }, 'Sin socios todavía.'))]));
    } catch (err) { alert(err.message); }
  }
  $('s-buscar').addEventListener('input', () => { clearTimeout(tSocios); tSocios = setTimeout(socios, 300); });
  $('f-socios').addEventListener('submit', (e) => { e.preventDefault(); socios(); });

  async function ajustar(s) {
    const v = prompt(`Puntos a sumar (o restar con signo -) para ${s.nombre}.\nTiene ${s.puntos}.`, '');
    if (!v) return;
    const nota = prompt('Motivo (se le muestra al cliente):', 'Ajuste de la tienda');
    if (nota === null) return;
    try { await api(`/club/socios/${s.id}/ajuste`, { method: 'POST', body: { puntos: parseInt(v, 10), nota } }); socios(); }
    catch (err) { alert(err.message); }
  }

  async function reiniciarNip(s) {
    if (!confirm(`¿Reiniciar el NIP de ${s.nombre}? Podrá crear uno nuevo en la página con su celular. Sus puntos no se pierden.`)) return;
    try { await api(`/club/socios/${s.id}/reiniciar-nip`, { method: 'POST' }); socios(); }
    catch (err) { alert(err.message); }
  }

  // ================= Productos =================
  async function productos() {
    try {
      const r = await api('/productos');
      const cats = [...new Set(r.productos.map((p) => p.categoria))];
      $('cats-lista').replaceChildren(...cats.map((c) => el('option', { value: c })));
      $('tbody-productos').replaceChildren(...r.productos.map(filaProducto));
    } catch (err) { $('prod-msg').textContent = err.message; }
  }

  function filaProducto(p) {
    const nombre = el('input', { type: 'text', value: p.nombre, 'aria-label': 'Nombre', maxlength: '120' });
    const precio = el('input', { type: 'text', inputmode: 'decimal', value: (p.precio / 100).toFixed(2), 'aria-label': 'Precio' });
    const cat = el('input', { type: 'text', value: p.categoria, list: 'cats-lista', 'aria-label': 'Categoría', maxlength: '40' });
    const activo = el('input', { type: 'checkbox', checked: p.activo, 'aria-label': 'Activo' });
    const dest = el('input', { type: 'checkbox', checked: p.destacado, 'aria-label': 'Destacado' });
    const guardar = el('button', {
      class: 'btn btn-vidrio', type: 'button',
      onclick: async () => {
        try {
          await api('/productos/' + p.id, { method: 'PATCH', body: { nombre: nombre.value, precio: precio.value, categoria: cat.value, activo: activo.checked, destacado: dest.checked } });
          guardar.textContent = '✓ Guardado';
          setTimeout(() => { guardar.textContent = 'Guardar'; }, 1500);
        } catch (err) { alert(err.message); }
      },
    }, 'Guardar');
    return el('tr', {},
      el('td', { 'data-label': 'Nombre' }, nombre),
      el('td', { 'data-label': 'Precio' }, precio),
      el('td', { 'data-label': 'Categoría' }, cat),
      el('td', { 'data-label': 'Activo' }, activo),
      el('td', { 'data-label': 'Destacado' }, dest),
      el('td', {}, guardar)
    );
  }

  $('f-producto').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('prod-msg').textContent = '';
    try {
      await api('/productos', { method: 'POST', body: { nombre: $('np-nombre').value, precio: $('np-precio').value, categoria: $('np-cat').value } });
      $('np-nombre').value = '';
      $('np-precio').value = '';
      $('np-nombre').focus();
      productos();
    } catch (err) { $('prod-msg').textContent = err.message; }
  });

  // ================= Buzón =================
  const TIPO = { queja: 'Queja', sugerencia: 'Sugerencia', felicitacion: 'Felicitación', producto: 'Quiere producto' };
  async function buzon() {
    try {
      const r = await api('/opiniones' + ($('b-todas').checked ? '?todas=1' : ''));
      $('b-promedio').textContent = r.calificaciones ? `Calificación promedio: ${r.promedio.toFixed(1)} ★ (${r.calificaciones} opiniones)` : '';
      $('lista-opiniones').replaceChildren(...(r.opiniones.length ? r.opiniones.map((o) => el('article', { class: 'item' + (o.tipo === 'queja' && !o.atendida ? ' nuevo' : '') },
        el('div', { class: 'item-cabeza' },
          el('span', { class: 'etq etq-' + o.tipo }, TIPO[o.tipo] || o.tipo),
          o.calificacion ? el('span', { class: 'estrellas-txt', 'aria-label': `${o.calificacion} de 5` }, '★'.repeat(o.calificacion) + '☆'.repeat(5 - o.calificacion)) : null
        ),
        el('p', {}, o.mensaje),
        el('small', {}, [o.nombre || 'Anónimo', fecha(o.creado_en), o.socio_id ? '⭐ socio' : ''].filter(Boolean).join(' · ')),
        el('div', { class: 'acciones' },
          o.telefono ? el('a', { class: 'btn btn-whatsapp', href: wa(o.telefono, `Hola ${(o.nombre || '').split(' ')[0]}, gracias por escribirnos en el buzón de SuperMass.`), target: '_blank', rel: 'noopener' }, 'Responder') : null,
          el('button', {
            class: 'btn ' + (o.atendida ? 'btn-vidrio' : 'btn-verde'), type: 'button',
            onclick: async () => { try { await api('/opiniones/' + o.id, { method: 'PATCH', body: { atendida: !o.atendida } }); buzon(); resumen(); } catch (err) { alert(err.message); } },
          }, o.atendida ? 'Reabrir' : '✓ Atendida')
        )
      )) : [el('p', { class: 'resumen' }, '¡Buzón al día! No hay pendientes.')]));
    } catch (err) { alert(err.message); }
  }
  $('b-todas').addEventListener('change', buzon);

  // ================= Facebook =================
  let fbEstado = null;
  let fbFoto = null;
  let fbUrlPreview = null;

  const PLANTILLAS = {
    promo: () => '🔥 ¡PROMO EN SUPERMASS! 🔥\n\n[Producto] a solo $[precio]\n\nVálido hasta el [fecha] o hasta agotar existencias.\n📍 Te esperamos, estamos cerca de ti.\n⭐ Si eres del Club SuperMass, además sumas puntos.',
    club: () => '⭐ ¿Ya tienes tu tarjeta del Club SuperMass? ⭐\n\nEs GRATIS y te regalamos 20 puntos al unirte.\n🛒 Por cada $10 de compra ganas 1 punto\n🎁 Cámbialos por refrescos, huevo, despensa y más\n🎂 Puntos dobles en tu mes de cumpleaños\n\nCréala en un minuto 👇',
    pedidos: () => '🛵 ¿No puedes venir? ¡Te lo llevamos!\n\nArma tu pedido en nuestra página y te lo llevamos a tu casa.\nTambién suma puntos del Club SuperMass ⭐\n\nHaz tu pedido aquí 👇',
    ganador: async () => {
      const r = await api('/ganadores');
      const g = r.ganadores[0];
      if (!g) throw new Error('Todavía no hay ganadores en la tómbola.');
      return `🎉 ¡TENEMOS GANADOR! 🎉\n\nFelicidades a ${g.nombre} con el ticket ${g.ticket}, que se lleva: ${g.premio} 🏆\n\nGracias a todos por participar y por su preferencia. ¡Vienen más sorpresas para nuestros clientes! 🛒`;
    },
  };
  const ENLACE_PLANTILLA = { club: '/club', pedidos: '/pedido', ganador: '', promo: '' };

  document.querySelectorAll('[data-plantilla]').forEach((b) => b.addEventListener('click', async () => {
    const tipo = b.dataset.plantilla;
    if ($('fb-mensaje').value.trim() && !confirm('¿Reemplazar el texto que ya escribiste?')) return;
    try {
      $('fb-mensaje').value = await PLANTILLAS[tipo]();
      $('fb-enlace').value = ENLACE_PLANTILLA[tipo];
      contarFb();
      $('fb-mensaje').focus();
    } catch (err) { $('fb-error').textContent = err.message; }
  }));

  const contarFb = () => { $('fb-cuenta').textContent = `${$('fb-mensaje').value.length} / 2000`; };
  $('fb-mensaje').addEventListener('input', contarFb);

  $('fb-foto').addEventListener('change', () => {
    const f = $('fb-foto').files[0];
    if (!f) return;
    fbFoto = f;
    if (fbUrlPreview) URL.revokeObjectURL(fbUrlPreview);
    fbUrlPreview = URL.createObjectURL(f);
    $('fb-img').src = fbUrlPreview;
    $('fb-preview').hidden = false;
  });
  $('fb-quitar').addEventListener('click', () => {
    fbFoto = null;
    $('fb-foto').value = '';
    $('fb-preview').hidden = true;
  });

  $('f-fb').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('fb-error').textContent = '';
    $('fb-ok').hidden = true;
    const mensaje = $('fb-mensaje').value.trim();
    if (mensaje.length < 3) { $('fb-error').textContent = 'Escribe el texto de la publicación.'; return; }
    if (/\[(producto|precio|fecha)\]/i.test(mensaje)) { $('fb-error').textContent = 'Cambia los datos entre corchetes [ ] antes de publicar.'; return; }
    if (!confirm('Esto se publicará en la página de Facebook de SuperMass y lo verá todo el público. ¿Publicar?')) return;

    const datos = new FormData();
    datos.append('mensaje', mensaje);
    if ($('fb-enlace').value && fbEstado) datos.append('enlace', fbEstado.sitio + $('fb-enlace').value);
    if (fbFoto) datos.append('foto', fbFoto);
    const btn = $('fb-publicar');
    btn.disabled = true;
    btn.textContent = 'Publicando…';
    try {
      const resp = await fetch('/api/admin/facebook/publicar', { method: 'POST', body: datos, credentials: 'same-origin' });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.error || 'No se pudo publicar.');
      $('fb-ok').hidden = false;
      $('fb-ok').replaceChildren('✓ ¡Publicado! ', json.enlace ? el('a', { href: json.enlace, target: '_blank', rel: 'noopener' }, 'Verlo en Facebook') : '');
      $('fb-mensaje').value = '';
      $('fb-quitar').click();
      contarFb();
      setTimeout(recientesFb, 3000);
    } catch (err) {
      $('fb-error').textContent = err.message;
    } finally {
      btn.disabled = !fbEstado || !fbEstado.conectado;
      btn.textContent = 'Publicar en Facebook';
    }
  });

  async function recientesFb() {
    try {
      const r = await fetch('/api/facebook/publicaciones', { cache: 'no-store' }).then((x) => x.json());
      const fmtDia = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
      $('fb-recientes').replaceChildren(...(r.publicaciones.length ? r.publicaciones.map((p) =>
        el('a', { class: 'vidrio fb-post', href: p.enlace, target: '_blank', rel: 'noopener' },
          el('img', { src: p.imagen, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
          el('div', { class: 'fb-texto' }, p.texto ? el('p', {}, p.texto) : null, el('small', {}, fmtDia.format(new Date(p.fecha))))
        )) : [el('p', { class: 'resumen' }, 'No hay publicaciones con foto todavía.')]));
    } catch { /* sin conexión */ }
  }

  async function facebook() {
    try {
      fbEstado = await api('/facebook/estado');
      $('fb-desconectado').hidden = fbEstado.conectado;
      $('fb-publicar').disabled = !fbEstado.conectado;
    } catch (err) { $('fb-error').textContent = err.message; }
    recientesFb();
  }

  // ================= Navegación =================
  let reloj;
  function activar(nombre) {
    clearInterval(reloj);
    resumen();
    if (nombre === 'caja') setTimeout(() => $('c-tel').focus(), 50);
    if (nombre === 'pedidos') { pedidos(); reloj = setInterval(() => { pedidos(); }, 30000); }
    if (nombre === 'socios') socios();
    if (nombre === 'productos') productos();
    if (nombre === 'buzon') buzon();
    if (nombre === 'facebook') facebook();
  }
  // Revisa pedidos nuevos aunque estés en otra pestaña del panel
  setInterval(resumen, 30000);

  return { activar, pestanas: ['caja', 'pedidos', 'socios', 'productos', 'buzon', 'facebook'] };
})();
