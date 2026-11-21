require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const sharp = require('sharp');
const rateLimit = require('express-rate-limit');

const config = require('./src/config');
const db = require('./src/db');
const auth = require('./src/auth');
const { imagenOg } = require('./src/og');
const club = require('./src/club');
const facebook = require('./src/facebook');

const app = express();
const PUBLIC = path.join(__dirname, 'public');

app.set('trust proxy', 1); // Render va detrás de un proxy
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.fbcdn.net'],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(express.json({ limit: '50kb' }));

// ---------- Utilidades ----------

const escHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const urlBase = (req) => config.publicUrl || `${req.protocol}://${req.get('host')}`;

const enmascarar = (tel) => `•• •••• ${String(tel).slice(-4)}`;

const plantillas = {};
const telBonito = (t) => (t ? `${t.slice(0, 2)} ${t.slice(2, 6)} ${t.slice(6)}` : '');

function render(archivo, req, res, ruta = '/') {
  if (!plantillas[archivo] || !config.produccion) {
    plantillas[archivo] = fs.readFileSync(path.join(PUBLIC, archivo), 'utf8');
  }
  const base = urlBase(req);
  const datos = {
    TIENDA_HORARIO: config.tienda.horario,
    TIENDA_ZONA_ENVIO: config.tienda.zonaEnvio,
    TIENDA_WHATSAPP: telBonito(config.tienda.whatsapp),
    TIENDA_TELEFONO: telBonito(config.tienda.telefono || config.tienda.whatsapp),
    TEL_URL: 'tel:+52' + (config.tienda.telefono || config.tienda.whatsapp),
    MAPS_URL: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('SuperMass ' + config.tienda.direccion),
    WHATSAPP_URL: config.tienda.whatsapp ? `https://wa.me/52${config.tienda.whatsapp}?text=${encodeURIComponent('¡Hola SuperMass! Quiero hacer un pedido 🛒')}` : '/pedido',
    CLUB_BIENVENIDA: String(club.publico().bienvenida),
    CLUB_PESOS_PUNTO: String(club.publico().pesosPorPunto),
    CLUB_REFERIDO: String(club.publico().referido),
    RIFA_NOMBRE: config.rifa.nombre,
    RIFA_PREMIO: config.rifa.premio,
    RIFA_FECHA: config.rifa.fecha,
    TIENDA_DIRECCION: config.tienda.direccion,
    TIENDA_RESPONSABLE: config.tienda.responsable,
    TIENDA_CORREO: config.tienda.correo ? `al correo ${config.tienda.correo}` : 'en el mostrador de la tienda',
    FACEBOOK_URL: config.tienda.facebook,
    PAGE_URL: base + ruta,
    OG_IMAGE: config.ogImageUrl || `${base}/og.png`,
    ANIO: String(new Date().getFullYear()),
  };
  const cfg = JSON.stringify({
    shareUrl: base + '/rifa',
    baseUrl: base,
    premio: config.rifa.premio,
    nombre: config.rifa.nombre,
    fecha: config.rifa.fecha,
    registroAbierto: config.rifa.registroAbierto,
    maxFotoMb: config.limites.tamanoFotoMb,
    whatsapp: config.tienda.whatsapp ? '52' + config.tienda.whatsapp : '',
    club: club.publico(),
  }).replace(/</g, '\\u003c');
  const html = plantillas[archivo]
    .replace('{{CONFIG_JSON}}', cfg)
    .replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in datos ? escHtml(datos[k]) : m));
  res.type('html').set('Cache-Control', 'no-cache').send(html);
}

// ---------- Páginas públicas ----------

app.get(['/', '/index.html'], (req, res) => render('index.html', req, res, '/'));
app.get(['/rifa', '/rifa.html'], (req, res) => render('rifa.html', req, res, '/rifa'));
app.get(['/club', '/club.html'], (req, res) => render('club.html', req, res, '/club'));
app.get(['/pedido', '/pedido.html'], (req, res) => render('pedido.html', req, res, '/pedido'));
app.get(['/buzon', '/buzon.html'], (req, res) => render('buzon.html', req, res, '/buzon'));
app.get(['/aviso-privacidad', '/aviso-privacidad.html'], (req, res) => render('aviso-privacidad.html', req, res));
app.get(['/admin', '/admin/'], (req, res) => {
  res.set('Cache-Control', 'no-store').sendFile(path.join(PUBLIC, 'admin.html'));
});

app.get('/og.png', async (req, res, next) => {
  try {
    res.type('png').set('Cache-Control', 'public, max-age=3600').send(await imagenOg());
  } catch (err) {
    next(err);
  }
});

// Usa logo.png / logo.jpg si los subes; si no, el logo SVG incluido.
app.get('/logo', (req, res) => {
  for (const archivo of ['logo.png', 'logo.jpg', 'logo.webp', 'logo.svg']) {
    const ruta = path.join(PUBLIC, 'img', archivo);
    if (fs.existsSync(ruta)) return res.set('Cache-Control', 'public, max-age=300').sendFile(ruta);
  }
  res.sendStatus(404);
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/api/facebook/publicaciones', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=300').json({ publicaciones: await facebook.publicaciones() });
});

app.use(express.static(PUBLIC, { index: false, maxAge: config.produccion ? '1h' : 0 }));

// ---------- Registro de tickets ----------

const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limites.tamanoFotoMb * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

const limitePorIp = rateLimit({
  windowMs: 60 * 1000,
  limit: config.limites.registrosPorIpMinuto,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Vas muy rápido 😅. Espera un minutito y vuelve a intentar.' },
});

const limpiarNombre = (s) => String(s || '').replace(/\s+/g, ' ').trim();

app.post('/api/registro', limitePorIp, (req, res, next) => {
  subida.single('foto')(req, res, (err) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `La foto pesa mucho. Máximo ${config.limites.tamanoFotoMb} MB.`, campo: 'foto' });
    }
    if (err) return next(err);
    registrar(req, res).catch(next);
  });
});

async function registrar(req, res) {
  if (!config.rifa.registroAbierto) {
    return res.status(403).json({ error: 'El registro para esta rifa ya cerró. ¡Gracias por participar!' });
  }
  // Campo trampa para bots: los humanos no lo ven.
  if (req.body.sitio) return res.status(400).json({ error: 'No se pudo registrar.' });

  const ticket = String(req.body.ticket || '').trim();
  const nombre = limpiarNombre(req.body.nombre);
  const telefono = String(req.body.telefono || '').replace(/\D/g, '');

  if (!/^\d{1,12}$/.test(ticket)) return res.status(400).json({ error: 'El número de ticket solo lleva números (hasta 12).', campo: 'ticket' });
  if (nombre.length < 3 || nombre.length > 120 || !/^[\p{L}][\p{L}\s.'-]+$/u.test(nombre)) {
    return res.status(400).json({ error: 'Escribe tu nombre completo, sin números.', campo: 'nombre' });
  }
  if (!/^\d{10}$/.test(telefono)) return res.status(400).json({ error: 'El teléfono debe tener 10 dígitos.', campo: 'telefono' });
  if (req.body.privacidad !== 'si') return res.status(400).json({ error: 'Necesitas aceptar el aviso de privacidad.', campo: 'privacidad' });
  if (!req.file) return res.status(400).json({ error: 'Sube la foto de tu ticket (JPG o PNG).', campo: 'foto' });

  const existe = await db.query('SELECT 1 FROM registros WHERE ticket = $1', [ticket]);
  if (existe.rows.length) {
    return res.status(409).json({ error: `El ticket ${ticket} ya está registrado. Cada ticket participa una sola vez.`, campo: 'ticket' });
  }

  const haceUnMinuto = new Date(Date.now() - 60 * 1000);
  const conteo = await db.query(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN creado_en > $2 THEN 1 ELSE 0 END) AS recientes
       FROM registros WHERE telefono = $1`,
    [telefono, haceUnMinuto]
  );
  const total = Number(conteo.rows[0].total || 0);
  const recientes = Number(conteo.rows[0].recientes || 0);
  if (total >= config.limites.registrosPorTelefono) {
    return res.status(429).json({ error: 'Este teléfono ya llegó al máximo de tickets registrados. Si crees que es un error, pregunta en la tienda.', campo: 'telefono' });
  }
  if (recientes >= config.limites.registrosPorTelefonoMinuto) {
    return res.status(429).json({ error: 'Ya registraste varios tickets seguidos. Espera un minuto para el siguiente.', campo: 'telefono' });
  }

  let foto;
  try {
    foto = await sharp(req.file.buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
  } catch {
    return res.status(400).json({ error: 'No pudimos abrir la foto. Intenta con otra (JPG o PNG).', campo: 'foto' });
  }

  try {
    await db.query(
      `INSERT INTO registros (ticket, nombre, telefono, foto, foto_mime, ip)
       VALUES ($1, $2, $3, $4, 'image/jpeg', $5)`,
      [ticket, nombre, telefono, foto, String(req.ip || '').slice(0, 64)]
    );
  } catch (err) {
    if (db.esDuplicado(err)) {
      return res.status(409).json({ error: `El ticket ${ticket} ya está registrado. Cada ticket participa una sola vez.`, campo: 'ticket' });
    }
    throw err;
  }

  res.status(201).json({ ok: true, ticket, estado: 'pendiente' });
}

// ---------- Administrador ----------

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' },
});

app.post('/api/admin/login', limiteLogin, (req, res) => {
  if (!config.admin.password) {
    return res.status(503).json({ error: 'Falta configurar ADMIN_PASSWORD en el servidor.' });
  }
  const { usuario, password } = req.body || {};
  if (!auth.credencialesValidas(usuario, password)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  auth.iniciarSesion(res);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  auth.cerrarSesion(res);
  res.json({ ok: true });
});

const admin = express.Router();
admin.use(auth.requiereAdmin);
admin.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

admin.get('/me', (req, res) => res.json({ ok: true, usuario: config.admin.usuario, rifa: config.rifa, enMemoria: db.enMemoria }));

admin.get('/stats', async (req, res) => {
  const r = await db.query(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,
            SUM(CASE WHEN estado = 'validado' THEN 1 ELSE 0 END) AS validados,
            SUM(CASE WHEN estado = 'rechazado' THEN 1 ELSE 0 END) AS rechazados,
            SUM(CASE WHEN estado = 'validado' AND en_tombola THEN 1 ELSE 0 END) AS en_tombola
       FROM registros`
  );
  const fila = r.rows[0];
  const n = (v) => Number(v || 0);
  res.json({ total: n(fila.total), pendientes: n(fila.pendientes), validados: n(fila.validados), rechazados: n(fila.rechazados), enTombola: n(fila.en_tombola) });
});

const ESTADOS = ['pendiente', 'validado', 'rechazado'];
const POR_PAGINA = 50;

// Búsqueda de nombres sin importar acentos ni mayúsculas.
const NOMBRE_SIN_ACENTOS = "translate(LOWER(nombre), 'áéíóúüñàèìòù', 'aeiouunaeiou')";
const sinAcentos = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function filtros(req) {
  const condiciones = [];
  const params = [];
  const q = String(req.query.q || '').trim().slice(0, 120);
  if (q) {
    params.push(`%${sinAcentos(q)}%`);
    const i = params.length;
    const soloDigitos = q.replace(/\D/g, '');
    if (soloDigitos && soloDigitos.length === q.replace(/[\s-]/g, '').length) {
      params.push(`%${soloDigitos}%`);
      condiciones.push(`(ticket LIKE $${i + 1} OR telefono LIKE $${i + 1})`);
    } else {
      condiciones.push(`${NOMBRE_SIN_ACENTOS} LIKE $${i}`);
    }
  }
  if (ESTADOS.includes(req.query.estado)) {
    params.push(req.query.estado);
    condiciones.push(`estado = $${params.length}`);
  }
  return { where: condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '', params };
}

admin.get('/registros', async (req, res) => {
  const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
  const { where, params } = filtros(req);
  const total = await db.query(`SELECT COUNT(*) AS n FROM registros ${where}`, params);
  const filas = await db.query(
    `SELECT id, ticket, nombre, telefono, estado, en_tombola, creado_en, revisado_en
       FROM registros ${where}
      ORDER BY id DESC
      LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`,
    params
  );
  res.json({ registros: filas.rows, total: Number(total.rows[0].n), pagina, porPagina: POR_PAGINA });
});

admin.get('/registros/:id/foto', async (req, res) => {
  const r = await db.query('SELECT foto, foto_mime FROM registros WHERE id = $1', [Number(req.params.id) || 0]);
  if (!r.rows.length) return res.sendStatus(404);
  res.set('Cache-Control', 'private, max-age=3600').type(r.rows[0].foto_mime).send(db.leerBinario(r.rows[0].foto));
});

admin.patch('/registros/:id', async (req, res) => {
  const estado = req.body && req.body.estado;
  if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado no válido.' });
  const r = await db.query(
    `UPDATE registros SET estado = $1, revisado_en = $2 WHERE id = $3 RETURNING id, estado`,
    [estado, estado === 'pendiente' ? null : new Date(), Number(req.params.id) || 0]
  );
  if (!r.rows.length) return res.status(404).json({ error: 'Registro no encontrado.' });
  res.json({ ok: true, ...r.rows[0] });
});

const fmtFechaCsv = new Intl.DateTimeFormat('es-MX', {
  timeZone: process.env.ZONA_HORARIA || 'America/Mexico_City',
  dateStyle: 'short',
  timeStyle: 'short',
});

// Ticket y teléfono como texto para que Excel no borre los ceros a la izquierda.
const textoExcel = (digitos) => '"=""' + digitos + '"""';

const celdaCsv = (v) => {
  let s = v == null ? '' : v instanceof Date ? fmtFechaCsv.format(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita fórmulas en Excel
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

admin.get('/export.csv', async (req, res) => {
  const { where, params } = filtros(req);
  const r = await db.query(
    `SELECT id, ticket, nombre, telefono, estado, en_tombola, creado_en, revisado_en FROM registros ${where} ORDER BY id`,
    params
  );
  const encabezado = ['ID', 'Ticket', 'Nombre', 'Teléfono', 'Estado', 'En tómbola', 'Registrado', 'Revisado'];
  const lineas = r.rows.map((f) =>
    [
      celdaCsv(f.id), textoExcel(f.ticket), celdaCsv(f.nombre), textoExcel(f.telefono), celdaCsv(f.estado),
      celdaCsv(f.en_tombola ? 'sí' : 'no'), celdaCsv(f.creado_en), celdaCsv(f.revisado_en),
    ].join(',')
  );
  const fecha = new Date().toISOString().slice(0, 10);
  res
    .type('text/csv; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="registros-supermass-${fecha}.csv"`)
    .send('﻿' + [encabezado.join(','), ...lineas].join('\r\n'));
});

admin.post('/sorteo', async (req, res) => {
  const premio = String((req.body && req.body.premio) || '').trim().slice(0, 160);
  const sacar = !req.body || req.body.sacar !== false;
  if (!premio) return res.status(400).json({ error: 'Escribe qué premio se va a sortear.' });

  const candidatos = await db.query(
    `SELECT id FROM registros WHERE estado = 'validado' AND en_tombola = TRUE ORDER BY id`
  );
  if (!candidatos.rows.length) {
    return res.status(400).json({ error: 'No hay tickets validados en la tómbola todavía.' });
  }
  // Selección aleatoria criptográficamente segura.
  const elegido = candidatos.rows[crypto.randomInt(candidatos.rows.length)].id;
  const r = await db.query('SELECT id, ticket, nombre, telefono FROM registros WHERE id = $1', [elegido]);
  const g = r.rows[0];

  const ins = await db.query(
    `INSERT INTO ganadores (registro_id, premio, ticket, nombre, telefono)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, sorteado_en`,
    [g.id, premio, g.ticket, g.nombre, g.telefono]
  );
  if (sacar) await db.query('UPDATE registros SET en_tombola = FALSE WHERE id = $1', [g.id]);

  res.json({
    ganador: {
      id: ins.rows[0].id,
      premio,
      ticket: g.ticket,
      nombre: g.nombre,
      telefono: enmascarar(g.telefono),
      sorteadoEn: ins.rows[0].sorteado_en,
      sacado: sacar,
    },
    participantes: candidatos.rows.length,
  });
});

admin.get('/ganadores', async (req, res) => {
  const r = await db.query('SELECT id, registro_id, premio, ticket, nombre, telefono, sorteado_en FROM ganadores ORDER BY id DESC');
  res.json({ ganadores: r.rows.map((g) => ({ ...g, telefonoOculto: enmascarar(g.telefono) })) });
});

// Regresa a un ganador a la tómbola (por si no se presentó y se resortea).
admin.post('/registros/:id/tombola', async (req, res) => {
  const enTombola = !!(req.body && req.body.enTombola);
  const r = await db.query('UPDATE registros SET en_tombola = $1 WHERE id = $2 RETURNING id', [enTombola, Number(req.params.id) || 0]);
  if (!r.rows.length) return res.status(404).json({ error: 'Registro no encontrado.' });
  res.json({ ok: true, enTombola });
});

// ---------- Publicar en Facebook ----------

admin.get('/facebook/estado', (req, res) => {
  res.json({ conectado: facebook.conectado(), pageId: facebook.pageId(), paginaUrl: config.tienda.facebook, sitio: urlBase(req) });
});

admin.post('/facebook/publicar', (req, res, next) => {
  subida.single('foto')(req, res, (err) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `La foto pesa mucho. Máximo ${config.limites.tamanoFotoMb} MB.` });
    if (err) return next(err);
    (async () => {
      const mensaje = String(req.body.mensaje || '').replace(/\r\n/g, '\n').trim().slice(0, 2000);
      const enlace = /^https?:\/\/\S+$/.test(String(req.body.enlace || '').trim()) ? req.body.enlace.trim() : '';
      if (mensaje.length < 3) return res.status(400).json({ error: 'Escribe el texto de la publicación.' });
      let foto = null;
      if (req.file) {
        try {
          const buffer = await sharp(req.file.buffer, { failOn: 'none' })
            .rotate()
            .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85, mozjpeg: true })
            .toBuffer();
          foto = { buffer, mime: 'image/jpeg' };
        } catch {
          return res.status(400).json({ error: 'No pudimos abrir la foto. Intenta con otra (JPG o PNG).' });
        }
      }
      try {
        res.json({ ok: true, ...(await facebook.publicar({ mensaje, enlace, foto })) });
      } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
      }
    })().catch(next);
  });
});

club(app, admin);
app.use('/api/admin', admin);

// ---------- Errores ----------

app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado.' }));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Algo salió mal de nuestro lado. Intenta de nuevo en un momento.' });
});

db.iniciar()
  .then(() => {
    if (!config.admin.password) console.warn('⚠️  ADMIN_PASSWORD no está configurada: el panel de administrador está desactivado.');
    app.listen(config.port, () => console.log(`SuperMass Rifa escuchando en http://localhost:${config.port}`));
  })
  .catch((err) => {
    console.error('No se pudo iniciar la base de datos:', err);
    process.exit(1);
  });
