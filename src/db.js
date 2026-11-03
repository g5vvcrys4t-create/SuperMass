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
}

// pg-mem no maneja bien parámetros binarios; en memoria guardamos la foto como base64.
const query = (texto, params) =>
  pool.query(texto, enMemoria && params ? params.map((p) => (Buffer.isBuffer(p) ? p.toString('base64') : p)) : params);

const leerBinario = (valor) => (enMemoria ? Buffer.from(Buffer.from(valor).toString(), 'base64') : valor);

const esDuplicado = (err) =>
  err && err.code === '23505';

module.exports = { iniciar, query, esDuplicado, leerBinario, get enMemoria() { return enMemoria; } };
