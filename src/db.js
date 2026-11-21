// Conexión a PostgreSQL (Render, Supabase o local).
// Sin DATABASE_URL se usa una base en memoria (pg-mem) solo para desarrollo.
const { Pool } = require('pg');

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS registros (
     id SERIAL PRIMARY KEY,
     ticket VARCHAR(12) NOT NULL UNIQUE,
     nombre VARCHAR(120) NOT NULL,
     telefono VARCHAR(10) NOT NULL,
     foto BYTEA NOT NULL,
     foto_mime VARCHAR(40) NOT NULL DEFAULT 'image/jpeg',
     estado VARCHAR(12) NOT NULL DEFAULT 'pendiente',
     en_tombola BOOLEAN NOT NULL DEFAULT TRUE,
     ip VARCHAR(64),
     creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     revisado_en TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS registros_telefono_idx ON registros (telefono)`,
  `CREATE INDEX IF NOT EXISTS registros_estado_idx ON registros (estado)`,
  `CREATE TABLE IF NOT EXISTS ganadores (
     id SERIAL PRIMARY KEY,
     registro_id INTEGER,
     premio VARCHAR(160) NOT NULL,
     ticket VARCHAR(12) NOT NULL,
     nombre VARCHAR(120) NOT NULL,
     telefono VARCHAR(10) NOT NULL,
     sorteado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,

  // ---------- Club SuperMass ----------
  `CREATE TABLE IF NOT EXISTS socios (
     id SERIAL PRIMARY KEY,
     telefono VARCHAR(10) NOT NULL UNIQUE,
     nombre VARCHAR(120) NOT NULL,
     pin VARCHAR(120),
     cumple VARCHAR(5),
     codigo VARCHAR(8) NOT NULL UNIQUE,
     referido_por INTEGER,
     puntos INTEGER NOT NULL DEFAULT 0,
     historicos INTEGER NOT NULL DEFAULT 0,
     compras INTEGER NOT NULL DEFAULT 0,
     ultima_opinion TIMESTAMPTZ,
     ultima_compra TIMESTAMPTZ,
     creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS movimientos (
     id SERIAL PRIMARY KEY,
     socio_id INTEGER NOT NULL,
     tipo VARCHAR(16) NOT NULL,
     puntos INTEGER NOT NULL,
     monto INTEGER,
     nota VARCHAR(160),
     creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS movimientos_socio_idx ON movimientos (socio_id)`,
  `CREATE TABLE IF NOT EXISTS canjes (
     id SERIAL PRIMARY KEY,
     socio_id INTEGER NOT NULL,
     recompensa VARCHAR(40) NOT NULL,
     nombre VARCHAR(120) NOT NULL,
     puntos INTEGER NOT NULL,
     codigo VARCHAR(8) NOT NULL UNIQUE,
     estado VARCHAR(12) NOT NULL DEFAULT 'pendiente',
     creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     cerrado_en TIMESTAMPTZ
   )`,
  `CREATE TABLE IF NOT EXISTS productos (
     id SERIAL PRIMARY KEY,
     nombre VARCHAR(120) NOT NULL,
     precio INTEGER NOT NULL,
     categoria VARCHAR(40) NOT NULL,
     activo BOOLEAN NOT NULL DEFAULT TRUE,
     destacado BOOLEAN NOT NULL DEFAULT FALSE
   )`,
  `CREATE TABLE IF NOT EXISTS pedidos (
     id SERIAL PRIMARY KEY,
     socio_id INTEGER,
     nombre VARCHAR(120) NOT NULL,
     telefono VARCHAR(10) NOT NULL,
     entrega VARCHAR(12) NOT NULL,
     direccion VARCHAR(300),
     pago VARCHAR(20) NOT NULL,
     notas VARCHAR(500),
     extra VARCHAR(500),
     items TEXT NOT NULL,
     subtotal INTEGER NOT NULL,
     envio INTEGER NOT NULL DEFAULT 0,
     estado VARCHAR(12) NOT NULL DEFAULT 'nuevo',
     puntos_dados INTEGER NOT NULL DEFAULT 0,
     creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS opiniones (
     id SERIAL PRIMARY KEY,
     socio_id INTEGER,
     tipo VARCHAR(16) NOT NULL,
     calificacion INTEGER,
     mensaje VARCHAR(1000) NOT NULL,
     nombre VARCHAR(120),
     telefono VARCHAR(10),
     atendida BOOLEAN NOT NULL DEFAULT FALSE,
     creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
];

// Catálogo inicial (precios en centavos). Edítalo desde el panel → Productos.
const PRODUCTOS_INICIALES = [
  ['Coca-Cola 600 ml', 2200, 'Bebidas', true],
  ['Coca-Cola 2.5 L', 4800, 'Bebidas', true],
  ['Agua natural 1.5 L', 1800, 'Bebidas', false],
  ['Jugo 1 L', 3200, 'Bebidas', false],
  ['Cerveza six pack', 11500, 'Bebidas', true],
  ['Leche entera 1 L', 3000, 'Lácteos y huevo', true],
  ['Huevo blanco 1 kg', 5200, 'Lácteos y huevo', true],
  ['Queso panela 400 g', 6500, 'Lácteos y huevo', false],
  ['Yogur bebible 1 L', 3600, 'Lácteos y huevo', false],
  ['Pan de caja grande', 5200, 'Panadería', true],
  ['Tortillas 1 kg', 2400, 'Panadería', true],
  ['Arroz 1 kg', 3200, 'Despensa', false],
  ['Frijol negro 1 kg', 4200, 'Despensa', false],
  ['Aceite 1 L', 4600, 'Despensa', true],
  ['Azúcar 1 kg', 3400, 'Despensa', false],
  ['Atún en lata', 2400, 'Despensa', false],
  ['Café soluble 100 g', 7200, 'Despensa', false],
  ['Papas fritas grandes', 2600, 'Botanas y dulces', true],
  ['Galletas surtidas', 2200, 'Botanas y dulces', false],
  ['Papel higiénico 4 rollos', 3800, 'Limpieza y hogar', true],
  ['Detergente 1 kg', 4400, 'Limpieza y hogar', false],
  ['Jabón de trastes 750 ml', 3200, 'Limpieza y hogar', false],
  ['Cloro 1 L', 2000, 'Limpieza y hogar', false],
  ['Pañales paquete', 18900, 'Bebé y cuidado', false],
];

let pool;
let enMemoria = false;

function usarSsl(url) {
  if (process.env.DB_SSL === 'true') return true;
  if (process.env.DB_SSL === 'false') return false;
  if (/sslmode=require/.test(url)) return true;
  try {
    const host = new URL(url).hostname;
    // Los hosts internos de Render (dpg-xxxx-a) no llevan punto ni SSL.
    return host.includes('.') && host !== 'localhost' && host !== '127.0.0.1';
  } catch {
    return false;
  }
}

async function iniciar() {
  const url = process.env.DATABASE_URL;
  if (url) {
    pool = new Pool({
      connectionString: url,
      ssl: usarSsl(url) ? { rejectUnauthorized: false } : false,
      max: 10,
    });
  } else {
    let newDb;
    try {
      ({ newDb } = require('pg-mem'));
    } catch {
      throw new Error('Falta DATABASE_URL. Configura la conexión a PostgreSQL.');
    }
    const mem = newDb();
    // pg-mem no trae translate(); lo agregamos para la búsqueda sin acentos.
    mem.public.registerFunction({
      name: 'translate',
      args: ['text', 'text', 'text'],
      returns: 'text',
      implementation: (texto, de, a) =>
        texto == null ? texto : [...texto].map((c) => (de.includes(c) ? a[de.indexOf(c)] || '' : c)).join(''),
    });
    pool = new (mem.adapters.createPg().Pool)();
    enMemoria = true;
    console.warn('⚠️  Sin DATABASE_URL: usando base de datos EN MEMORIA (los datos se borran al reiniciar).');
  }
  for (const sql of ESQUEMA) await pool.query(sql);

  const hay = await pool.query('SELECT COUNT(*) AS n FROM productos');
  if (Number(hay.rows[0].n) === 0) {
    for (const [nombre, precio, categoria, destacado] of PRODUCTOS_INICIALES) {
      await pool.query('INSERT INTO productos (nombre, precio, categoria, destacado) VALUES ($1, $2, $3, $4)', [nombre, precio, categoria, destacado]);
    }
  }
}

// pg-mem no maneja bien parámetros binarios; en memoria guardamos la foto como base64.
const query = (texto, params) =>
  pool.query(texto, enMemoria && params ? params.map((p) => (Buffer.isBuffer(p) ? p.toString('base64') : p)) : params);

const leerBinario = (valor) => (enMemoria ? Buffer.from(Buffer.from(valor).toString(), 'base64') : valor);

const esDuplicado = (err) =>
  err && err.code === '23505';

module.exports = { iniciar, query, esDuplicado, leerBinario, get enMemoria() { return enMemoria; } };
