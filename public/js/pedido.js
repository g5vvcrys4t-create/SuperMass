(() => {
  'use strict';
  const { cfg, $, api, el, pesos, num, soloNumeros, marcar, guardar, leer, listo } = window.SM;
  const club = cfg.club;
  const CLAVE = 'sm_carrito';

  let productos = [];
  let carrito = leer(CLAVE, {}); // { idProducto: cantidad }
  let categoria = 'Más pedidos';

  soloNumeros($('telefono'), 10);
  $('chip-envio').textContent = club.costoEnvio ? `🛵 Envío $${club.costoEnvio} · mínimo $${club.pedidoMinimo}` : `🛵 Envío gratis · mínimo $${club.pedidoMinimo}`;
  $('extra').value = leer('sm_extra', '');
  $('extra').addEventListener('input', () => { guardar('sm_extra', $('extra').value); actualizarBarra(); });

  // ---------- Catálogo ----------
  const sinAcentos = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function categorias() {
    const cats = [...new Set(productos.map((p) => p.categoria))];
    return productos.some((p) => p.destacado) ? ['Más pedidos', ...cats] : cats;
  }

  function pintarCats() {
    const cats = categorias();
    if (!cats.includes(categoria)) categoria = cats[0];
    $('cats').replaceChildren(...cats.map((c) =>
      el('button', { type: 'button', 'aria-pressed': String(c === categoria && !$('buscar').value), onclick: () => { categoria = c; $('buscar').value = ''; pintar(); } }, c)
    ));
  }

  function stepper(p) {
    const cant = carrito[p.id] || 0;
    const out = el('output', { 'aria-live': 'polite' }, String(cant));
    const caja = el('div', { class: 'stepper' + (cant ? '' : ' vacio') },
      el('button', { type: 'button', class: 'menos-btn', 'aria-label': `Quitar un ${p.nombre}`, onclick: () => cambiar(p.id, -1) }, '−'),
      out,
      el('button', { type: 'button', class: 'mas-btn', 'aria-label': `Agregar ${p.nombre}`, onclick: () => cambiar(p.id, 1) }, '+')
    );
    return caja;
  }

  function fila(p) {
    return el('div', { class: 'prod', 'data-id': p.id },
      el('div', { class: 'prod-info' },
        el('strong', {}, p.nombre, p.destacado && categoria !== 'Más pedidos' ? el('span', { class: 'top' }, 'Top') : null),
        el('span', {}, pesos(p.precio))
      ),
      stepper(p)
    );
  }

  function pintar() {
    pintarCats();
    const q = sinAcentos($('buscar').value.trim());
    let lista;
    let titulo;
    if (q) {
      lista = productos.filter((p) => sinAcentos(p.nombre).includes(q));
      titulo = `Resultados para «${$('buscar').value.trim()}»`;
    } else if (categoria === 'Más pedidos') {
      lista = productos.filter((p) => p.destacado);
      titulo = 'Lo más pedido';
    } else {
      lista = productos.filter((p) => p.categoria === categoria);
      titulo = categoria;
    }
    $('catalogo').replaceChildren(
      el('h2', { class: 'cat-titulo' }, titulo),
      lista.length
        ? el('div', { class: 'vidrio productos' }, lista.map(fila))
        : el('p', { class: 'sin-resultados' }, 'No lo encontramos en la lista. Escríbelo abajo en «¿No ves algo?» y te lo conseguimos.')
    );
  }

  function cambiar(id, delta) {
    const nueva = Math.max(0, Math.min(99, (carrito[id] || 0) + delta));
    if (nueva) carrito[id] = nueva; else delete carrito[id];
    guardar(CLAVE, carrito);
    const nodo = document.querySelector(`.prod[data-id="${id}"] .stepper`);
    const p = productos.find((x) => x.id === id);
    if (nodo && p) nodo.replaceWith(stepper(p));
    actualizarBarra();
  }

  function items() {
    return Object.entries(carrito)
      .map(([id, cantidad]) => ({ p: productos.find((x) => x.id === Number(id)), cantidad }))
      .filter((i) => i.p);
  }

  const subtotal = () => items().reduce((t, i) => t + i.p.precio * i.cantidad, 0);

  function actualizarBarra() {
    const n = items().reduce((t, i) => t + i.cantidad, 0);
    const hayExtra = $('extra').value.trim().length > 2;
    $('cb-total').textContent = pesos(subtotal());
    $('cb-items').textContent = n ? `${n} producto${n === 1 ? '' : 's'}${hayExtra ? ' + tu lista' : ''}` : hayExtra ? 'Tu lista escrita' : '';
    $('carrito-barra').classList.toggle('visible', (n > 0 || hayExtra) && !$('paso-productos').hidden);
  }

  $('buscar').addEventListener('input', pintar);

  // ---------- Pasos ----------
  function irDatos() {
    if (!items().length && $('extra').value.trim().length < 3) {
      $('buscar').focus();
      $('catalogo').prepend(el('p', { class: 'nota-info' }, 'Agrega al menos un producto o escribe lo que necesitas.'));
      return;
    }
    $('paso-productos').hidden = true;
    $('paso-datos').hidden = false;
    actualizarBarra();
    resumen();
    scrollTo({ top: 0, behavior: 'smooth' });
    $('nombre').value ? $('direccion').focus() : $('nombre').focus();
  }
  $('ir-datos').addEventListener('click', irDatos);
  $('cb-continuar').addEventListener('click', irDatos);
  $('volver').addEventListener('click', () => {
    $('paso-datos').hidden = true;
    $('paso-productos').hidden = false;
    pintar();
    actualizarBarra();
  });

  const entrega = () => document.querySelector('input[name="entrega"]:checked').value;
  document.querySelectorAll('input[name="entrega"]').forEach((r) => r.addEventListener('change', () => {
    $('campo-direccion').hidden = entrega() !== 'domicilio';
    resumen();
  }));

  function resumen() {
    const sub = subtotal();
    const socio = window.SM.socio;
    const envioGratis = socio && socio.nivel.envioGratis;
    const envio = entrega() === 'domicilio' && !envioGratis ? club.costoEnvio * 100 : 0;
    const filas = items().map((i) => el('li', {}, el('span', {}, `${i.cantidad} × ${i.p.nombre}`), el('span', {}, pesos(i.p.precio * i.cantidad))));
    if ($('extra').value.trim()) filas.push(el('li', {}, el('span', {}, `📝 ${$('extra').value.trim()}`), el('span', {}, 'por confirmar')));
    if (entrega() === 'domicilio') filas.push(el('li', {}, el('span', {}, 'Envío'), el('span', {}, envio ? pesos(envio) : 'GRATIS')));
    filas.push(el('li', { class: 'total' }, el('span', {}, 'Total aprox.'), el('span', {}, pesos(sub + envio))));
    $('resumen').replaceChildren(...filas);

    const mult = socio ? socio.nivel.multiplicador * (socio.mesCumple ? club.cumpleMultiplicador : 1) : 1;
    const pts = Math.floor(Math.floor((sub + envio) / 100 / club.pesosPorPunto) * mult);
    $('gana').replaceChildren(
      '⭐ ',
      socio
        ? el('span', {}, 'Con este pedido ganas ', el('b', {}, `${num(pts)} puntos`), ' en tu tarjeta.')
        : el('span', {}, 'Con tarjeta del Club ganarías ', el('b', {}, `${num(pts)} puntos`), '. ', el('a', { href: '/club' }, 'Créala gratis'), '.')
    );
  }

  // ---------- Enviar ----------
  $('form-pedido').addEventListener('submit', async (e) => {
    e.preventDefault();
    ['nombre', 'telefono', 'direccion'].forEach((c) => marcar(c, ''));
    $('error-general').textContent = '';
    const datos = {
      nombre: $('nombre').value.trim(),
      telefono: $('telefono').value,
      entrega: entrega(),
      direccion: $('direccion').value.trim(),
      pago: document.querySelector('input[name="pago"]:checked').value,
      notas: $('notas').value.trim(),
      extra: $('extra').value.trim(),
      items: items().map((i) => ({ id: i.p.id, cantidad: i.cantidad })),
      sitio: $('form-pedido').sitio.value,
    };
    if (datos.nombre.length < 3) return marcar('nombre', 'Escribe tu nombre.');
    if (datos.telefono.length !== 10) return marcar('telefono', 'Tu celular debe tener 10 dígitos.');
    if (datos.entrega === 'domicilio' && datos.direccion.length < 8) return marcar('direccion', 'Escribe calle, número y colonia.');

    guardar('sm_datos', { nombre: datos.nombre, telefono: datos.telefono, direccion: datos.direccion });
    const btn = $('enviar');
    btn.disabled = true;
    btn.classList.add('cargando');
    try {
      const r = await api('/pedidos', { method: 'POST', body: datos });
      carrito = {};
      guardar(CLAVE, {});
      guardar('sm_extra', '');
      $('paso-datos').hidden = true;
      $('paso-listo').hidden = false;
      $('folio').textContent = r.folio;
      if (r.whatsapp) {
        $('t-listo').textContent = 'Último paso: envíalo por WhatsApp';
        $('listo-texto').textContent = 'Toca el botón verde para mandar tu pedido a la tienda. Ahí te confirmamos el total y la hora de entrega.';
        $('abrir-wa').href = r.whatsapp;
        $('abrir-wa').hidden = false;
      } else {
        $('listo-texto').textContent = 'Ya lo tenemos en la tienda. Te llamamos o escribimos para confirmar el total y la hora de entrega.';
      }
      $('unirme').hidden = r.socio;
      actualizarBarra();
      $('paso-listo').focus();
      scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err.campo) marcar(err.campo, err.message);
      else $('error-general').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.classList.remove('cargando');
    }
  });

  // ---------- Inicio ----------
  const previos = leer('sm_datos', null);
  if (previos) {
    $('nombre').value = previos.nombre || '';
    $('telefono').value = previos.telefono || '';
    $('direccion').value = previos.direccion || '';
  }
  listo.then(() => {
    const s = window.SM.socio;
    if (s) {
      if (!$('nombre').value) $('nombre').value = s.nombre;
      if (!$('telefono').value) $('telefono').value = s.telefono;
      if (s.nivel.envioGratis) $('chip-envio').textContent = '🛵 Envío GRATIS para ti (Consentido)';
    }
  });

  api('/catalogo')
    .then((d) => {
      productos = d.productos;
      // Limpia del carrito productos que ya no existen
      Object.keys(carrito).forEach((id) => { if (!productos.some((p) => p.id === Number(id))) delete carrito[id]; });
      pintar();
      actualizarBarra();
    })
    .catch(() => {
      $('catalogo').replaceChildren(el('p', { class: 'nota-info' }, 'No pudimos cargar la lista. Escribe tu pedido abajo o mándanos WhatsApp.'));
    });
})();
