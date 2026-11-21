(() => {
  'use strict';
  const { cfg, $, api, soloNumeros, marcar, listo } = window.SM;
  soloNumeros($('telefono'), 10);

  const tipo = () => document.querySelector('input[name="tipo"]:checked').value;
  const PISTAS = {
    queja: ['¿Qué pasó?', 'Cuéntanos qué pasó, cuándo y, si puedes, quién te atendió…'],
    sugerencia: ['Tu idea', '¿Qué podemos hacer mejor?'],
    felicitacion: ['¿Qué te gustó?', 'Se lo diremos a quien te atendió 😊'],
    producto: ['¿Qué producto quieres?', 'Marca, tamaño o presentación. Si varios lo piden, lo traemos.'],
  };
  function pista() {
    const [etiqueta, ph] = PISTAS[tipo()];
    $('mensaje-label').textContent = etiqueta;
    $('mensaje').placeholder = ph;
  }
  document.querySelectorAll('input[name="tipo"]').forEach((r) => r.addEventListener('change', pista));
  if (location.hash === '#producto') $('tipo-producto').checked = true;
  pista();

  listo.then(() => {
    const s = window.SM.socio;
    if (s) {
      $('datos-contacto').hidden = true;
      if (cfg.club.opinion) {
        $('aviso-puntos').hidden = false;
        $('aviso-puntos').textContent = `Hola, ${s.nombre.split(' ')[0]}: por tu opinión te regalamos ${cfg.club.opinion} puntos (una vez por semana).`;
      }
    } else {
      $('exito-club').textContent = 'Crear mi tarjeta gratis';
    }
  });

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    marcar('mensaje', '');
    marcar('telefono', '');
    $('error-general').textContent = '';
    const cal = document.querySelector('input[name="cal"]:checked');
    const datos = {
      tipo: tipo(),
      calificacion: cal ? cal.value : '',
      mensaje: $('mensaje').value.trim(),
      nombre: $('nombre').value.trim(),
      telefono: $('telefono').value,
      sitio: $('form').sitio.value,
    };
    if (datos.mensaje.length < 5) return marcar('mensaje', 'Cuéntanos un poco más.');
    if (datos.telefono && datos.telefono.length !== 10) return marcar('telefono', 'El celular debe tener 10 dígitos o déjalo vacío.');

    const btn = $('enviar');
    btn.disabled = true;
    btn.classList.add('cargando');
    try {
      const r = await api('/opiniones', { method: 'POST', body: datos });
      $('bloque-form').hidden = true;
      $('exito').hidden = false;
      if (r.puntos) $('exito-texto').textContent = `Ya sumamos ${r.puntos} puntos a tu tarjeta. Lo revisamos y te contactamos si hace falta.`;
      else if (datos.tipo === 'producto') $('exito-texto').textContent = 'Anotado. Si varios vecinos lo piden, lo traemos a la tienda.';
      $('exito').focus();
    } catch (err) {
      if (err.campo) marcar(err.campo, err.message);
      else $('error-general').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.classList.remove('cargando');
    }
  });
})();
