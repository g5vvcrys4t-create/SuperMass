(() => {
  'use strict';
  const { cfg, $, el, num } = window.SM;
  const club = cfg.club || { recompensas: [], niveles: [] };

  $('banda-rifa').hidden = !cfg.registroAbierto;

  // Premios
  $('lista-premios').append(...club.recompensas.map((r) =>
    el('article', { class: 'vidrio premio-card' },
      el('span', { class: 'premio-pts' }, num(r.puntos), ' ', el('small', {}, 'pts')),
      el('h3', {}, r.nombre),
      el('p', {}, r.detalle),
      el('span', { class: 'equiv' }, `Te sale con unos $${num(r.puntos * club.pesosPorPunto)} en compras`)
    )
  ));

  // Niveles
  $('lista-niveles').append(...club.niveles.map((n, i) =>
    el('article', { class: 'vidrio nivel' + (i === club.niveles.length - 1 ? ' destacado' : '') },
      el('div', { class: 'nivel-top' },
        el('h3', {}, n.nombre),
        el('span', { class: 'desde' }, n.desde ? `desde ${num(n.desde)} pts` : 'al unirte')
      ),
      el('ul', {}, n.beneficios.map((b) => el('li', {}, b)))
    )
  ));

  // Envío
  const envio = $('dato-envio');
  if (envio) {
    envio.textContent = club.costoEnvio
      ? `Envío $${club.costoEnvio} · gratis para socios Consentidos · mínimo $${club.pedidoMinimo}`
      : `Envío gratis · pedido mínimo $${club.pedidoMinimo}`;
  }

  // Calculadora: cuánto gana al año un cliente normal
  const gasto = $('gasto');
  const premiosOrden = [...club.recompensas].sort((a, b) => a.puntos - b.puntos);
  function calcular() {
    const semanal = Number(gasto.value);
    $('gasto-out').textContent = `$${num(semanal)}`;
    const puntosAnio = Math.floor((semanal * 52) / club.pesosPorPunto) + club.bienvenida;
    const caro = premiosOrden.filter((r) => r.puntos <= puntosAnio).pop();
    const barato = premiosOrden[1] || premiosOrden[0];
    const partes = [`En un año juntas <strong>${num(puntosAnio)} puntos</strong>`];
    if (barato) partes.push(`: eso es ${num(Math.floor(puntosAnio / barato.puntos))} × ${barato.nombre.toLowerCase()}`);
    if (caro && caro !== barato) partes.push(`, o tu ${caro.nombre.toLowerCase()} y más`);
    // Solo números y textos del programa (sin datos del usuario), seguro para innerHTML.
    $('calc-res').innerHTML = partes.join('') + '. Sin contar los bonos de nivel.';
  }
  gasto.addEventListener('input', calcular);
  calcular();

  // Publicaciones de Facebook
  const fmtDia = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' });
  window.SM.api('/facebook/publicaciones')
    .then(({ publicaciones }) => {
      if (!publicaciones.length) return;
      $('fb-grid').append(...publicaciones.map((p) =>
        el('a', { class: 'vidrio fb-post', href: p.enlace, target: '_blank', rel: 'noopener' },
          el('img', { src: p.imagen, alt: p.texto ? p.texto.slice(0, 120) : 'Publicación de SuperMass en Facebook', loading: 'lazy', referrerpolicy: 'no-referrer' }),
          el('div', { class: 'fb-texto' },
            p.texto ? el('p', {}, p.texto) : null,
            el('small', {}, fmtDia.format(new Date(p.fecha)), ' · Ver en Facebook →')
          )
        )
      ));
      $('novedades').hidden = false;
    })
    .catch(() => {});

  // Puntos de la tarjeta de muestra
  const demo = $('demo-pts');
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const fin = 1240;
    const t0 = performance.now();
    const paso = (t) => {
      const p = Math.min(1, (t - t0) / 1400);
      demo.textContent = num(Math.round(fin * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }
})();
