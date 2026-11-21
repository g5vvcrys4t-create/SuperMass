// Club SuperMass: tarjeta de puntos, canjes, pedidos y buzón de quejas y sugerencias.
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const programa = require('./programa');

// ---------- Utilidades ----------

const COOKIE = 'sm_socio';
const DIAS_SESION = 120;
// Si no hay SESSION_SECRET, las sesiones de socios duran hasta reiniciar el servidor (seguro, pero menos cómodo).
const SECRETO = config.admin.sessionSecret ? 'socio:' + config.admin.sessionSecret : crypto.randomBytes(32).toString('hex');
const firmar = (v) => crypto.createHmac('sha256', SECRETO).update(v).digest('base64url');

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I
const codigo = (n = 6) => Array.from({ length: n }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join('');

const limpiarNombre = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const nombreValido = (n) => n.length >= 3 && n.length <= 120 && /^[\p{L}][\p{L}\s.'-]+$/u.test(n);
const soloDigitos = (s) => String(s || '').replace(/\D/g, '');
const texto = (s, max) => String(s || '').replace(/\r\n/g, '\n').trim().slice(0, max);

const hashPin = (pin) => {
  const sal = crypto.randomBytes(16).toString('hex');
  return `${sal}:${crypto.scryptSync(pin, sal, 32).toString('hex')}`;
};
const pinCorrecto = (pin, guardado) => {
  if (!guardado) return false;
  const [sal, hash] = guardado.split(':');
  const intento = crypto.scryptSync(String(pin), sal, 32);
  return crypto.timingSafeEqual(intento, Buffer.from(hash, 'hex'));
};

const pesos = (centavos) => '$' + (centavos / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function nivelDe(historicos) {
  let actual = programa.niveles[0];
  for (const n of programa.niveles) if (historicos >= n.desde) actual = n;
  const i = programa.niveles.indexOf(actual);
  const siguiente = programa.niveles[i + 1] || null;
  return { actual, siguiente, faltan: siguiente ? siguiente.desde - historicos : 0 };
}

const esMesCumple = (cumple) => !!cumple && cumple.slice(0, 2) === String(new Date().getMonth() + 1).padStart(2, '0');

function puntosPorCompra(centavos, socio) {
  const base = Math.floor(centavos / 100 / programa.pesosPorPunto);
  const { actual } = nivelDe(socio.historicos);
  const cumple = esMesCumple(socio.cumple) ? programa.cumpleMultiplicador : 1;
  return { puntos: Math.floor(base * actual.multiplicador * cumple), base, multiplicador: actual.multiplicador, cumple: cumple > 1 };
}

async function mover(socioId, tipo, puntos, nota, monto = null) {
  await db.query(
    'INSERT INTO movimientos (socio_id, tipo, puntos, monto, nota) VALUES ($1, $2, $3, $4, $5)',
    [socioId, tipo, puntos, monto, nota ? String(nota).slice(0, 160) : null]
  );
  if (puntos > 0) {
    await db.query('UPDATE socios SET puntos = puntos + $1, historicos = historicos + $1 WHERE id = $2', [puntos, socioId]);
  } else if (puntos < 0) {
    await db.query('UPDATE socios SET puntos = puntos + $1 WHERE id = $2', [puntos, socioId]);
  }
}

const socioPorTel = async (tel) => (await db.query('SELECT * FROM socios WHERE telefono = $1', [tel])).rows[0] || null;
const socioPorId = async (id) => (await db.query('SELECT * FROM socios WHERE id = $1', [id])).rows[0] || null;

async function crearSocio({ telefono, nombre, pin, cumple, referidoPor }) {
  let cod;
  for (let i = 0; i < 5; i++) {
    cod = codigo(6);
    const r = await db.query('SELECT 1 FROM socios WHERE codigo = $1', [cod]);
    if (!r.rows.length) break;
  }
  const ins = await db.query(
    `INSERT INTO socios (telefono, nombre, pin, cumple, codigo, referido_por) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [telefono, nombre, pin ? hashPin(pin) : null, cumple || null, cod, referidoPor || null]
  );
  const id = ins.rows[0].id;
  if (programa.bienvenida) await mover(id, 'bono', programa.bienvenida, 'Bienvenida al Club SuperMass');
  return socioPorId(id);
}

// Suma una compra y, si es la primera de un invitado, paga el bono de referido a los dos.
async function sumarCompra(socio, centavos, nota) {
  const calc = puntosPorCompra(centavos, socio);
  if (calc.puntos > 0) await mover(socio.id, 'compra', calc.puntos, nota || 'Compra en tienda', centavos);
  else await db.query('INSERT INTO movimientos (socio_id, tipo, puntos, monto, nota) VALUES ($1, $2, 0, $3, $4)', [socio.id, 'compra', centavos, nota || 'Compra en tienda']);
  await db.query('UPDATE socios SET compras = compras + 1, ultima_compra = $1 WHERE id = $2', [new Date(), socio.id]);

  let referido = false;
  if (socio.compras === 0 && socio.referido_por && programa.referido) {
    const padrino = await socioPorId(socio.referido_por);
    if (padrino) {
      await mover(socio.id, 'referido', programa.referido, 'Bono por llegar invitado');
      await mover(padrino.id, 'referido', programa.referido, `Invitaste a ${socio.nombre.split(' ')[0]}`);
      referido = true;
    }
  }
  return { ...calc, referido };
}

function vistaSocio(s) {
  const nv = nivelDe(s.historicos);
  return {
    nombre: s.nombre,
    telefono: s.telefono,
    codigo: s.codigo,
    puntos: s.puntos,
    historicos: s.historicos,
    compras: s.compras,
    cumple: s.cumple,
    mesCumple: esMesCumple(s.cumple),
    nivel: { id: nv.actual.id, nombre: nv.actual.nombre, multiplicador: nv.actual.multiplicador, envioGratis: nv.actual.envioGratis },
    siguiente: nv.siguiente ? { nombre: nv.siguiente.nombre, desde: nv.siguiente.desde, faltan: nv.faltan } : null,
    desde: s.creado_en,
  };
}

// ---------- Sesión del socio ----------

function iniciarSesion(res, socioId) {
  const expira = Date.now() + DIAS_SESION * 86400 * 1000;
  const datos = `${socioId}.${expira}`;
  res.cookie(COOKIE, `${datos}.${firmar(datos)}`, {
    httpOnly: true, sameSite: 'lax', secure: config.produccion, maxAge: DIAS_SESION * 86400 * 1000, path: '/',
  });
}

function socioDeSesion(req) {
  const token = auth.leerCookie(req, COOKIE);
  if (!token) return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [id, expira, firma] = partes;
  if (!auth.igualSeguro(firma, firmar(`${id}.${expira}`))) return null;
  if (Number(expira) < Date.now()) return null;
  return Number(id) || null;
}

async function requiereSocio(req, res, next) {
  const id = socioDeSesion(req);
  const socio = id && (await socioPorId(id));
  if (!socio) return res.status(401).json({ error: 'Entra a tu tarjeta para continuar.' });
  req.socio = socio;
  next();
}

// Bloqueo por teléfono tras 5 NIP equivocados (15 min).
const fallos = new Map();
const bloqueado = (tel) => {
  const f = fallos.get(tel);
  return f && f.n >= 5 && Date.now() - f.t < 15 * 60 * 1000;
};
const fallo = (tel) => {
  const f = fallos.get(tel);
  if (!f || Date.now() - f.t > 15 * 60 * 1000) fallos.set(tel, { n: 1, t: Date.now() });
  else f.n += 1;
};

const limite = (por, minutos, mensaje) =>
  rateLimit({ windowMs: minutos * 60 * 1000, limit: por, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: mensaje } });

const limiteEntrar = limite(15, 15, 'Demasiados intentos. Espera 15 minutos.');
const limiteAlta = limite(6, 60, 'Demasiados registros desde esta conexión. Intenta más tarde.');
const limitePedido = limite(8, 30, 'Ya enviaste varios pedidos. Espera un poco o escríbenos por WhatsApp.');
const limiteOpinion = limite(5, 30, 'Gracias, ya recibimos tus comentarios. Intenta más tarde.');

const envolver = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- Rutas ----------

module.exports = function montarClub(app, admin) {
  const api = express.Router();

  // Reglas públicas del programa (también se inyectan en las páginas).
  api.get('/club/programa', (req, res) => res.json(publico()));

  // Crear tarjeta (o activar una creada en caja, que no tiene NIP).
  api.post('/club/registro', limiteAlta, envolver(async (req, res) => {
    const b = req.body || {};
    if (b.sitio) return res.status(400).json({ error: 'No se pudo registrar.' });
    const nombre = limpiarNombre(b.nombre);
    const telefono = soloDigitos(b.telefono);
    const pin = String(b.pin || '');
    const cumple = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(b.cumple || '') ? b.cumple : null;

    if (!nombreValido(nombre)) return res.status(400).json({ error: 'Escribe tu nombre, sin números.', campo: 'nombre' });
    if (!/^\d{10}$/.test(telefono)) return res.status(400).json({ error: 'El celular debe tener 10 dígitos.', campo: 'telefono' });
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'Tu NIP son 4 números.', campo: 'pin' });
    if (/^(\d)\1{3}$|^1234$|^4321$/.test(pin)) return res.status(400).json({ error: 'Ese NIP es muy fácil de adivinar. Elige otro.', campo: 'pin' });
    if (b.privacidad !== 'si') return res.status(400).json({ error: 'Necesitas aceptar el aviso de privacidad.', campo: 'privacidad' });

    const existe = await socioPorTel(telefono);
    if (existe && existe.pin) {
      return res.status(409).json({ error: 'Ese celular ya tiene tarjeta. Entra con tu NIP.', campo: 'telefono', yaExiste: true });
    }
    let socio;
    if (existe) {
      await db.query('UPDATE socios SET pin = $1, nombre = $2, cumple = COALESCE($3, cumple) WHERE id = $4', [hashPin(pin), nombre, cumple, existe.id]);
      socio = await socioPorId(existe.id);
    } else {
      let referidoPor = null;
      const ref = String(b.ref || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      if (ref) {
        const r = await db.query('SELECT id FROM socios WHERE codigo = $1', [ref]);
        if (r.rows.length) referidoPor = r.rows[0].id;
      }
      try {
        socio = await crearSocio({ telefono, nombre, pin, cumple, referidoPor });
      } catch (err) {
        if (db.esDuplicado(err)) return res.status(409).json({ error: 'Ese celular ya tiene tarjeta. Entra con tu NIP.', campo: 'telefono', yaExiste: true });
        throw err;
      }
    }
    iniciarSesion(res, socio.id);
    res.status(201).json({ ok: true, nuevo: !existe, socio: vistaSocio(socio) });
  }));

  api.post('/club/entrar', limiteEntrar, envolver(async (req, res) => {
    const telefono = soloDigitos((req.body || {}).telefono);
    const pin = String((req.body || {}).pin || '');
    if (!/^\d{10}$/.test(telefono)) return res.status(400).json({ error: 'El celular debe tener 10 dígitos.', campo: 'telefono' });
    if (bloqueado(telefono)) return res.status(429).json({ error: 'Por seguridad bloqueamos esta tarjeta 15 minutos. Si olvidaste tu NIP, pide en caja que lo reinicien.' });
    const socio = await socioPorTel(telefono);
    if (socio && !socio.pin) {
      return res.status(409).json({ error: 'Tu tarjeta se creó en caja. Crea tu NIP para activarla.', activar: true, nombre: socio.nombre });
    }
    if (!socio || !pinCorrecto(pin, socio.pin)) {
      fallo(telefono);
      return res.status(401).json({ error: 'Celular o NIP incorrectos.', campo: 'pin' });
    }
    fallos.delete(telefono);
    iniciarSesion(res, socio.id);
    res.json({ ok: true, socio: vistaSocio(socio) });
  }));

  api.post('/club/salir', (req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  api.get('/club/yo', envolver(async (req, res) => {
    const id = socioDeSesion(req);
    const s = id && (await socioPorId(id));
    // Sin sesión respondemos 200 con socio null (evita errores en la consola de los visitantes)
    if (!s) return res.set('Cache-Control', 'no-store').json({ socio: null });
    const [movs, canjes, invitados] = await Promise.all([
      db.query('SELECT tipo, puntos, monto, nota, creado_en FROM movimientos WHERE socio_id = $1 ORDER BY id DESC LIMIT 30', [s.id]),
      db.query('SELECT id, nombre, puntos, codigo, estado, creado_en, cerrado_en FROM canjes WHERE socio_id = $1 ORDER BY id DESC LIMIT 20', [s.id]),
      db.query('SELECT COUNT(*) AS n FROM socios WHERE referido_por = $1', [s.id]),
    ]);
    res.set('Cache-Control', 'no-store').json({
      socio: vistaSocio(s),
      movimientos: movs.rows,
      canjes: canjes.rows,
      invitados: Number(invitados.rows[0].n),
    });
  }));

  api.post('/club/canjear', envolver(requiereSocio), envolver(async (req, res) => {
    const rec = programa.recompensas.find((r) => r.id === (req.body || {}).recompensa);
    if (!rec) return res.status(400).json({ error: 'Esa recompensa ya no está disponible.' });
    // Descuento atómico: solo si alcanzan los puntos.
    const r = await db.query('UPDATE socios SET puntos = puntos + $1 WHERE id = $2 AND puntos >= $3 RETURNING puntos', [-rec.puntos, req.socio.id, rec.puntos]);
    if (!r.rows.length) return res.status(400).json({ error: `Te faltan ${rec.puntos - req.socio.puntos} puntos para esta recompensa.` });
    let cod;
    for (let i = 0; i < 5; i++) {
      cod = codigo(6);
      const ex = await db.query('SELECT 1 FROM canjes WHERE codigo = $1', [cod]);
      if (!ex.rows.length) break;
    }
    await db.query('INSERT INTO canjes (socio_id, recompensa, nombre, puntos, codigo) VALUES ($1, $2, $3, $4, $5)', [req.socio.id, rec.id, rec.nombre, rec.puntos, cod]);
    await db.query('INSERT INTO movimientos (socio_id, tipo, puntos, nota) VALUES ($1, $2, $3, $4)', [req.socio.id, 'canje', -rec.puntos, rec.nombre]);
    res.status(201).json({ ok: true, codigo: cod, recompensa: rec.nombre, puntos: r.rows[0].puntos });
  }));

  // ---------- Catálogo y pedidos ----------

  api.get('/catalogo', envolver(async (req, res) => {
    const r = await db.query('SELECT id, nombre, precio, categoria, destacado FROM productos WHERE activo = TRUE ORDER BY categoria, nombre');
    res.set('Cache-Control', 'no-cache').json({ productos: r.rows });
  }));

  api.post('/pedidos', limitePedido, envolver(async (req, res) => {
    const b = req.body || {};
    if (b.sitio) return res.status(400).json({ error: 'No se pudo enviar.' });
    const nombre = limpiarNombre(b.nombre);
    const telefono = soloDigitos(b.telefono);
    const entrega = b.entrega === 'recoger' ? 'recoger' : 'domicilio';
    const direccion = texto(b.direccion, 300);
    const pago = ['efectivo', 'tarjeta', 'transferencia'].includes(b.pago) ? b.pago : 'efectivo';
    const notas = texto(b.notas, 500);
    const extra = texto(b.extra, 500);

    if (!nombreValido(nombre)) return res.status(400).json({ error: 'Escribe tu nombre, sin números.', campo: 'nombre' });
    if (!/^\d{10}$/.test(telefono)) return res.status(400).json({ error: 'El celular debe tener 10 dígitos.', campo: 'telefono' });
    if (entrega === 'domicilio' && direccion.length < 8) return res.status(400).json({ error: 'Escribe tu dirección con calle, número y colonia.', campo: 'direccion' });

    // Precios SIEMPRE del servidor, nunca del navegador.
    const pedidos = Array.isArray(b.items) ? b.items.slice(0, 60) : [];
    const ids = pedidos.map((i) => Number(i.id)).filter((n) => Number.isInteger(n) && n > 0);
    const productos = ids.length ? (await db.query('SELECT id, nombre, precio FROM productos WHERE activo = TRUE')).rows : [];
    const items = [];
    for (const p of pedidos) {
      const prod = productos.find((x) => x.id === Number(p.id));
      const cant = Math.min(99, Math.max(0, parseInt(p.cantidad, 10) || 0));
      if (prod && cant) items.push({ id: prod.id, nombre: prod.nombre, precio: prod.precio, cantidad: cant });
    }
    if (!items.length && extra.length < 3) return res.status(400).json({ error: 'Tu pedido está vacío. Agrega productos o escribe lo que necesitas.' });

    const subtotal = items.reduce((t, i) => t + i.precio * i.cantidad, 0);
    if (items.length && !extra && subtotal < programa.pedidoMinimo * 100 && entrega === 'domicilio') {
      return res.status(400).json({ error: `El pedido mínimo a domicilio es de ${pesos(programa.pedidoMinimo * 100)}.` });
    }

    const id = socioDeSesion(req);
    const socio = (id && (await socioPorId(id))) || (await socioPorTel(telefono));
    const envioGratis = socio && nivelDe(socio.historicos).actual.envioGratis;
    const envio = entrega === 'domicilio' && !envioGratis ? programa.costoEnvio * 100 : 0;

    const ins = await db.query(
      `INSERT INTO pedidos (socio_id, nombre, telefono, entrega, direccion, pago, notas, extra, items, subtotal, envio)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [socio ? socio.id : null, nombre, telefono, entrega, entrega === 'domicilio' ? direccion : null, pago, notas || null, extra || null, JSON.stringify(items), subtotal, envio]
    );
    const folio = 'P-' + String(ins.rows[0].id).padStart(4, '0');
    const total = subtotal + envio;
    const pts = socio ? puntosPorCompra(total, socio).puntos : Math.floor(total / 100 / programa.pesosPorPunto);

    const lineas = [
      `🛒 *Pedido SuperMass ${folio}*`,
      `👤 ${nombre} · ${telefono}`,
      entrega === 'domicilio' ? `🛵 A domicilio: ${direccion}` : '🏪 Paso a recoger a la tienda',
      `💳 Pago: ${pago}`,
      '',
      ...items.map((i) => `• ${i.cantidad} × ${i.nombre} — ${pesos(i.precio * i.cantidad)}`),
    ];
    if (extra) lineas.push('', `📝 También necesito: ${extra}`);
    if (items.length) {
      lineas.push('', `Productos: ${pesos(subtotal)}`);
      if (entrega === 'domicilio') lineas.push(`Envío: ${envio ? pesos(envio) : 'GRATIS'}`);
      lineas.push(`*Total aprox.: ${pesos(total)}*`);
    }
    if (notas) lineas.push('', `Notas: ${notas}`);
    lineas.push('', socio ? `⭐ Socio del Club SuperMass (${socio.nombre.split(' ')[0]})` : '¿Me registran en el Club SuperMass para juntar puntos?');
    const mensaje = lineas.join('\n');

    res.status(201).json({
      ok: true, folio, subtotal, envio, total, puntos: pts, socio: !!socio,
      whatsapp: config.tienda.whatsapp ? `https://wa.me/52${config.tienda.whatsapp}?text=${encodeURIComponent(mensaje)}` : null,
    });
  }));

  // ---------- Buzón ----------

  api.post('/opiniones', limiteOpinion, envolver(async (req, res) => {
    const b = req.body || {};
    if (b.sitio) return res.status(400).json({ error: 'No se pudo enviar.' });
    const tipo = ['queja', 'sugerencia', 'felicitacion', 'producto'].includes(b.tipo) ? b.tipo : 'sugerencia';
    const mensaje = texto(b.mensaje, 1000);
    const calificacion = Math.min(5, Math.max(0, parseInt(b.calificacion, 10) || 0)) || null;
    const nombre = limpiarNombre(b.nombre).slice(0, 120) || null;
    const telefono = soloDigitos(b.telefono);
    if (mensaje.length < 5) return res.status(400).json({ error: 'Cuéntanos un poco más (mínimo 5 letras).', campo: 'mensaje' });
    if (telefono && !/^\d{10}$/.test(telefono)) return res.status(400).json({ error: 'El celular debe tener 10 dígitos o déjalo vacío.', campo: 'telefono' });

    const id = socioDeSesion(req);
    const socio = id ? await socioPorId(id) : null;
    await db.query(
      'INSERT INTO opiniones (socio_id, tipo, calificacion, mensaje, nombre, telefono) VALUES ($1, $2, $3, $4, $5, $6)',
      [socio ? socio.id : null, tipo, calificacion, mensaje, nombre || (socio && socio.nombre) || null, telefono || (socio && socio.telefono) || null]
    );
    let puntos = 0;
    if (socio && programa.opinion) {
      const limiteFecha = Date.now() - programa.opinionCadaDias * 86400 * 1000;
      if (!socio.ultima_opinion || new Date(socio.ultima_opinion).getTime() < limiteFecha) {
        await mover(socio.id, 'opinion', programa.opinion, 'Gracias por tu opinión');
        await db.query('UPDATE socios SET ultima_opinion = $1 WHERE id = $2', [new Date(), socio.id]);
        puntos = programa.opinion;
      }
    }
    res.status(201).json({ ok: true, puntos });
  }));

  app.use('/api', api);

  // ================= Administrador =================

  admin.get('/club/resumen', envolver(async (req, res) => {
    const hace7 = new Date(Date.now() - 7 * 86400 * 1000);
    const [s, n, c, p, o, pts] = await Promise.all([
      db.query('SELECT COUNT(*) AS n FROM socios'),
      db.query('SELECT COUNT(*) AS n FROM socios WHERE creado_en > $1', [hace7]),
      db.query("SELECT COUNT(*) AS n FROM canjes WHERE estado = 'pendiente'"),
      db.query("SELECT COUNT(*) AS n FROM pedidos WHERE estado = 'nuevo'"),
      db.query('SELECT COUNT(*) AS n FROM opiniones WHERE atendida = FALSE'),
      db.query("SELECT COUNT(*) AS n, SUM(monto) AS ventas FROM movimientos WHERE tipo = 'compra' AND creado_en > $1", [hace7]),
    ]);
    const num = (r) => Number(r.rows[0].n || 0);
    res.json({
      socios: num(s), nuevos7: num(n), canjesPendientes: num(c), pedidosNuevos: num(p), opinionesAbiertas: num(o),
      compras7: num(pts), ventas7: Number(pts.rows[0].ventas || 0),
    });
  }));

  // Caja: buscar socio por celular
  admin.get('/club/socio', envolver(async (req, res) => {
    const telefono = soloDigitos(req.query.telefono);
    if (!/^\d{10}$/.test(telefono)) return res.status(400).json({ error: 'Escribe el celular a 10 dígitos.' });
    const s = await socioPorTel(telefono);
    if (!s) return res.json({ socio: null });
    const canjes = await db.query("SELECT id, nombre, puntos, codigo, creado_en FROM canjes WHERE socio_id = $1 AND estado = 'pendiente' ORDER BY id", [s.id]);
    res.json({ socio: { id: s.id, ...vistaSocio(s), activado: !!s.pin }, canjes: canjes.rows });
  }));

  // Caja: alta rápida (el cliente crea su NIP después en la página)
  admin.post('/club/socios', envolver(async (req, res) => {
    const nombre = limpiarNombre((req.body || {}).nombre);
    const telefono = soloDigitos((req.body || {}).telefono);
    if (!nombreValido(nombre)) return res.status(400).json({ error: 'Escribe el nombre del cliente, sin números.' });
    if (!/^\d{10}$/.test(telefono)) return res.status(400).json({ error: 'El celular debe tener 10 dígitos.' });
    if (await socioPorTel(telefono)) return res.status(409).json({ error: 'Ese celular ya tiene tarjeta.' });
    const s = await crearSocio({ telefono, nombre });
    res.status(201).json({ ok: true, socio: { id: s.id, ...vistaSocio(s), activado: false } });
  }));

  // Caja: sumar puntos por compra
  admin.post('/club/compra', envolver(async (req, res) => {
    const telefono = soloDigitos((req.body || {}).telefono);
    const monto = Math.round(Number(String((req.body || {}).monto || '').replace(/[^\d.]/g, '')) * 100);
    const folio = texto((req.body || {}).folio, 30);
    if (!Number.isFinite(monto) || monto < 100) return res.status(400).json({ error: 'Escribe el total de la compra.' });
    if (monto > programa.compraMaxima * 100) return res.status(400).json({ error: `El máximo por ticket es ${pesos(programa.compraMaxima * 100)}. Revisa el monto.` });
    const s = await socioPorTel(telefono);
    if (!s) return res.status(404).json({ error: 'No encontramos ese celular.' });
    const r = await sumarCompra(s, monto, folio ? `Ticket ${folio}` : 'Compra en tienda');
    const act = await socioPorId(s.id);
    res.json({ ok: true, ...r, socio: { id: act.id, ...vistaSocio(act), activado: !!act.pin } });
  }));

  // Caja: entregar canje por código
  admin.post('/club/canjes/entregar', envolver(async (req, res) => {
    const cod = String((req.body || {}).codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const r = await db.query('SELECT c.*, s.nombre AS socio, s.telefono FROM canjes c JOIN socios s ON s.id = c.socio_id WHERE c.codigo = $1', [cod]);
    const c = r.rows[0];
    if (!c) return res.status(404).json({ error: 'Ese código no existe.' });
    if (c.estado !== 'pendiente') return res.status(409).json({ error: `Ese código ya fue ${c.estado === 'entregado' ? 'entregado' : 'cancelado'}.` });
    await db.query("UPDATE canjes SET estado = 'entregado', cerrado_en = $1 WHERE id = $2", [new Date(), c.id]);
    res.json({ ok: true, recompensa: c.nombre, socio: c.socio, telefono: c.telefono });
  }));

  admin.post('/club/canjes/:id/cancelar', envolver(async (req, res) => {
    const r = await db.query("UPDATE canjes SET estado = 'cancelado', cerrado_en = $1 WHERE id = $2 AND estado = 'pendiente' RETURNING socio_id, puntos, nombre", [new Date(), Number(req.params.id) || 0]);
    if (!r.rows.length) return res.status(404).json({ error: 'Ese canje ya no está pendiente.' });
    const c = r.rows[0];
    await db.query('INSERT INTO movimientos (socio_id, tipo, puntos, nota) VALUES ($1, $2, $3, $4)', [c.socio_id, 'devolucion', c.puntos, `Canje cancelado: ${c.nombre}`]);
    await db.query('UPDATE socios SET puntos = puntos + $1 WHERE id = $2', [c.puntos, c.socio_id]);
    res.json({ ok: true });
  }));

  admin.get('/club/socios', envolver(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 60);
    const params = [];
    let where = '';
    if (q) {
      const dig = soloDigitos(q);
      if (dig && dig.length === q.replace(/\s/g, '').length) { params.push(`%${dig}%`); where = 'WHERE telefono LIKE $1'; }
      else { params.push(`%${q.toLowerCase()}%`); where = 'WHERE LOWER(nombre) LIKE $1'; }
    }
    const r = await db.query(`SELECT id, nombre, telefono, puntos, historicos, compras, pin, ultima_compra, creado_en FROM socios ${where} ORDER BY id DESC LIMIT 100`, params);
    res.json({ socios: r.rows.map((s) => ({ ...s, pin: undefined, activado: !!s.pin, nivel: nivelDe(s.historicos).actual.nombre })) });
  }));

  admin.post('/club/socios/:id/ajuste', envolver(async (req, res) => {
    const puntos = parseInt((req.body || {}).puntos, 10);
    const nota = texto((req.body || {}).nota, 120) || 'Ajuste de la tienda';
    if (!puntos || Math.abs(puntos) > 5000) return res.status(400).json({ error: 'Escribe los puntos a sumar o restar (máx. 5000).' });
    const s = await socioPorId(Number(req.params.id) || 0);
    if (!s) return res.status(404).json({ error: 'Socio no encontrado.' });
    if (puntos < 0 && s.puntos + puntos < 0) return res.status(400).json({ error: `Solo tiene ${s.puntos} puntos.` });
    await mover(s.id, 'ajuste', puntos, nota);
    res.json({ ok: true, puntos: s.puntos + puntos });
  }));

  admin.post('/club/socios/:id/reiniciar-nip', envolver(async (req, res) => {
    const r = await db.query('UPDATE socios SET pin = NULL WHERE id = $1 RETURNING telefono', [Number(req.params.id) || 0]);
    if (!r.rows.length) return res.status(404).json({ error: 'Socio no encontrado.' });
    fallos.delete(r.rows[0].telefono);
    res.json({ ok: true });
  }));

  // Pedidos
  const ESTADOS_PEDIDO = ['nuevo', 'preparando', 'en camino', 'entregado', 'cancelado'];
  admin.get('/pedidos', envolver(async (req, res) => {
    const estado = ESTADOS_PEDIDO.includes(req.query.estado) ? req.query.estado : null;
    const r = await db.query(
      `SELECT * FROM pedidos ${estado ? 'WHERE estado = $1' : "WHERE estado <> 'entregado' AND estado <> 'cancelado'"} ORDER BY id DESC LIMIT 100`,
      estado ? [estado] : []
    );
    res.json({ pedidos: r.rows.map((p) => ({ ...p, folio: 'P-' + String(p.id).padStart(4, '0'), items: JSON.parse(p.items || '[]') })) });
  }));

  admin.patch('/pedidos/:id', envolver(async (req, res) => {
    const estado = (req.body || {}).estado;
    if (!ESTADOS_PEDIDO.includes(estado)) return res.status(400).json({ error: 'Estado no válido.' });
    const r = await db.query('SELECT * FROM pedidos WHERE id = $1', [Number(req.params.id) || 0]);
    const p = r.rows[0];
    if (!p) return res.status(404).json({ error: 'Pedido no encontrado.' });
    // Monto real cobrado (puede cambiar si se agregó algo por WhatsApp)
    const cobrado = (req.body || {}).cobrado != null ? Math.round(Number(req.body.cobrado) * 100) : p.subtotal + p.envio;
    let puntos = 0;
    if (estado === 'entregado' && !p.puntos_dados && cobrado >= 100) {
      const socio = (p.socio_id && (await socioPorId(p.socio_id))) || (await socioPorTel(p.telefono));
      if (socio) {
        puntos = (await sumarCompra(socio, cobrado, `Pedido P-${String(p.id).padStart(4, '0')}`)).puntos;
        await db.query('UPDATE pedidos SET puntos_dados = $1, socio_id = $2 WHERE id = $3', [Math.max(puntos, 1), socio.id, p.id]);
      }
    }
    await db.query('UPDATE pedidos SET estado = $1 WHERE id = $2', [estado, p.id]);
    res.json({ ok: true, puntos });
  }));

  // Productos
  admin.get('/productos', envolver(async (req, res) => {
    const r = await db.query('SELECT * FROM productos ORDER BY categoria, nombre');
    res.json({ productos: r.rows });
  }));

  const leerProducto = (b) => {
    const nombre = texto(b.nombre, 120);
    const categoria = texto(b.categoria, 40) || 'Otros';
    const precio = Math.round(Number(b.precio) * 100);
    if (nombre.length < 2) throw Object.assign(new Error('Escribe el nombre del producto.'), { status: 400 });
    if (!Number.isFinite(precio) || precio < 50 || precio > 10000000) throw Object.assign(new Error('Escribe un precio válido.'), { status: 400 });
    return { nombre, categoria, precio, activo: b.activo !== false, destacado: !!b.destacado };
  };

  admin.post('/productos', envolver(async (req, res) => {
    let p;
    try { p = leerProducto(req.body || {}); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
    const r = await db.query('INSERT INTO productos (nombre, precio, categoria, activo, destacado) VALUES ($1, $2, $3, $4, $5) RETURNING id', [p.nombre, p.precio, p.categoria, p.activo, p.destacado]);
    res.status(201).json({ ok: true, id: r.rows[0].id });
  }));

  admin.patch('/productos/:id', envolver(async (req, res) => {
    let p;
    try { p = leerProducto(req.body || {}); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
    const r = await db.query('UPDATE productos SET nombre = $1, precio = $2, categoria = $3, activo = $4, destacado = $5 WHERE id = $6 RETURNING id', [p.nombre, p.precio, p.categoria, p.activo, p.destacado, Number(req.params.id) || 0]);
    if (!r.rows.length) return res.status(404).json({ error: 'Producto no encontrado.' });
    res.json({ ok: true });
  }));

  // Buzón
  admin.get('/opiniones', envolver(async (req, res) => {
    const todas = req.query.todas === '1';
    const r = await db.query(`SELECT * FROM opiniones ${todas ? '' : 'WHERE atendida = FALSE'} ORDER BY id DESC LIMIT 150`);
    const prom = await db.query('SELECT AVG(calificacion) AS p, COUNT(calificacion) AS n FROM opiniones WHERE calificacion IS NOT NULL');
    res.json({ opiniones: r.rows, promedio: Number(prom.rows[0].p || 0), calificaciones: Number(prom.rows[0].n || 0) });
  }));

  admin.patch('/opiniones/:id', envolver(async (req, res) => {
    const r = await db.query('UPDATE opiniones SET atendida = $1 WHERE id = $2 RETURNING id', [!!(req.body || {}).atendida, Number(req.params.id) || 0]);
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrada.' });
    res.json({ ok: true });
  }));
};

function publico() {
  return {
    pesosPorPunto: programa.pesosPorPunto,
    bienvenida: programa.bienvenida,
    referido: programa.referido,
    opinion: programa.opinion,
    cumpleMultiplicador: programa.cumpleMultiplicador,
    niveles: programa.niveles.map(({ id, nombre, desde, multiplicador, beneficios }) => ({ id, nombre, desde, multiplicador, beneficios })),
    recompensas: programa.recompensas,
    pedidoMinimo: programa.pedidoMinimo,
    costoEnvio: programa.costoEnvio,
  };
}

module.exports.publico = publico;
