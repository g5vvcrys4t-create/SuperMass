(() => {
  'use strict';

  const cfg = JSON.parse(document.getElementById('config').textContent || '{}');
  const $ = (id) => document.getElementById(id);

  const form = $('form');
  const enviar = $('enviar');
  const errorGeneral = $('error-general');
  const camaras = [$('foto-camara'), $('foto-galeria')];
  const preview = $('foto-preview');
  const previewImg = $('foto-img');
  const botonesFoto = $('foto-botones');
  let foto = null; // Blob listo para subir
  let urlPreview = null;

  if (cfg.registroAbierto === false) {
    $('cerrado').hidden = false;
    form.hidden = true;
  }

  // ---------- Errores por campo ----------
  function marcar(campo, mensaje) {
    const el = $(campo + '-error');
    if (el) el.textContent = mensaje || '';
    const input = campo === 'foto' ? null : $(campo);
    if (input) input.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
  }

  function limpiarErrores() {
    ['ticket', 'nombre', 'telefono', 'foto', 'privacidad'].forEach((c) => marcar(c, ''));
    errorGeneral.textContent = '';
  }

  // Solo dígitos mientras escriben.
  ['ticket', 'telefono'].forEach((id) => {
    $(id).addEventListener('input', (e) => {
      const limpio = e.target.value.replace(/\D/g, '').slice(0, id === 'ticket' ? 12 : 10);
      if (limpio !== e.target.value) e.target.value = limpio;
      if ($(id).getAttribute('aria-invalid') === 'true') marcar(id, '');
    });
  });
  $('nombre').addEventListener('input', () => marcar('nombre', ''));
  $('privacidad').addEventListener('change', () => marcar('privacidad', ''));

  function validar() {
    const errores = {};
    const ticket = $('ticket').value.trim();
    const nombre = $('nombre').value.replace(/\s+/g, ' ').trim();
    const telefono = $('telefono').value.replace(/\D/g, '');

    if (!ticket) errores.ticket = 'Escribe el número de tu ticket.';
    else if (!/^\d{1,12}$/.test(ticket)) errores.ticket = 'Solo números, hasta 12 dígitos.';

    if (nombre.length < 3) errores.nombre = 'Escribe tu nombre completo.';
    else if (/\d/.test(nombre)) errores.nombre = 'El nombre no lleva números.';
    else if (nombre.split(' ').length < 2) errores.nombre = 'Ponle también tu apellido.';

    if (telefono.length !== 10) errores.telefono = 'Tu teléfono debe tener 10 dígitos.';
    if (!foto) errores.foto = 'Falta la foto de tu ticket.';
    if (!$('privacidad').checked) errores.privacidad = 'Marca la casilla para aceptar el aviso de privacidad.';
    return errores;
  }

  // ---------- Foto ----------
  async function comprimir(archivo) {
    // Reduce la foto en el celular para que suba rápido con pocos datos.
    try {
      const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
      const max = 1800;
      const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * escala);
      canvas.height = Math.round(bitmap.height * escala);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close && bitmap.close();
      const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82));
      return blob && blob.size < archivo.size ? blob : archivo;
    } catch {
      return archivo;
    }
  }

  camaras.forEach((input) => {
    input.addEventListener('change', async () => {
      const archivo = input.files && input.files[0];
      input.value = '';
      if (!archivo) return;
      if (!/^image\//.test(archivo.type)) {
        marcar('foto', 'Ese archivo no es una imagen. Sube una foto JPG o PNG.');
        return;
      }
      marcar('foto', '');
      foto = await comprimir(archivo);
      if (foto.size > (cfg.maxFotoMb || 10) * 1024 * 1024) {
        foto = null;
        marcar('foto', `La foto pesa mucho (máximo ${cfg.maxFotoMb || 10} MB). Intenta con otra.`);
        return;
      }
      if (urlPreview) URL.revokeObjectURL(urlPreview);
      urlPreview = URL.createObjectURL(foto);
      previewImg.src = urlPreview;
      preview.hidden = false;
      botonesFoto.hidden = true;
      $('foto-quitar').focus();
    });
  });

  $('foto-quitar').addEventListener('click', () => {
    foto = null;
    preview.hidden = true;
    botonesFoto.hidden = false;
    previewImg.removeAttribute('src');
    if (urlPreview) URL.revokeObjectURL(urlPreview);
    urlPreview = null;
    camaras[0].focus();
  });

  // ---------- Envío ----------
  function ocupado(si) {
    enviar.disabled = si;
    enviar.classList.toggle('cargando', si);
    enviar.querySelector('.btn-texto').textContent = si ? 'Registrando…' : 'Registrar mi ticket';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores();
    const errores = validar();
    const campos = Object.keys(errores);
    if (campos.length) {
      campos.forEach((c) => marcar(c, errores[c]));
      const primero = campos[0] === 'foto' ? camaras[0] : $(campos[0]);
      primero.focus();
      return;
    }

    const datos = new FormData();
    datos.append('ticket', $('ticket').value.trim());
    datos.append('nombre', $('nombre').value.replace(/\s+/g, ' ').trim());
    datos.append('telefono', $('telefono').value.replace(/\D/g, ''));
    datos.append('privacidad', 'si');
    datos.append('sitio', form.elements.sitio.value);
    datos.append('foto', foto, 'ticket.jpg');

    ocupado(true);
    try {
      const resp = await fetch('/api/registro', { method: 'POST', body: datos });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = json.error || 'No pudimos registrar tu ticket. Intenta de nuevo.';
        if (json.campo && $(json.campo + '-error')) {
          marcar(json.campo, msg);
          (json.campo === 'foto' ? camaras[0] : $(json.campo)).focus();
        } else {
          errorGeneral.textContent = msg;
        }
        return;
      }
      mostrarExito(json.ticket);
    } catch {
      errorGeneral.textContent = 'Parece que no hay internet. Revisa tu conexión e intenta otra vez.';
    } finally {
      ocupado(false);
    }
  });

  // ---------- Compartir ----------
  const url = cfg.shareUrl || location.origin + '/';
  const mensaje = `¡Ya estoy participando en la ${cfg.nombre || 'rifa'} de SuperMass! 🎉 Se rifa ${cfg.premio || 'un premiazo'}. Compra, registra tu ticket y participa:`;
  $('compartir-fb').href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
  $('compartir-wa').href = 'https://wa.me/?text=' + encodeURIComponent(mensaje + ' ' + url);

  function mostrarExito(ticket) {
    $('exito-ticket').textContent = ticket;
    $('bloque-form').hidden = true;
    const exito = $('exito');
    exito.hidden = false;
    exito.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    exito.focus({ preventScroll: true });
  }

  $('otro').addEventListener('click', () => {
    // Conservamos nombre y teléfono para registrar el siguiente ticket más rápido.
    const nombre = $('nombre').value;
    const telefono = $('telefono').value;
    form.reset();
    $('nombre').value = nombre;
    $('telefono').value = telefono;
    $('privacidad').checked = true;
    $('foto-quitar').click();
    limpiarErrores();
    $('exito').hidden = true;
    $('bloque-form').hidden = false;
    $('ticket').focus();
  });
})();
