// Sesión de administrador con cookie firmada (HMAC). Sin estado en servidor.
const crypto = require('crypto');
const config = require('./config');

const COOKIE = 'sm_admin';

const secreto = () =>
  config.admin.sessionSecret ||
  crypto.createHash('sha256').update('supermass:' + config.admin.password).digest('hex');

const firmar = (valor) => crypto.createHmac('sha256', secreto()).update(valor).digest('base64url');

function igualSeguro(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function credencialesValidas(usuario, password) {
  if (!config.admin.password) return false;
  // Evaluamos ambas comparaciones siempre para no filtrar cuál falló.
  const okUsuario = igualSeguro(usuario || '', config.admin.usuario);
  const okPassword = igualSeguro(password || '', config.admin.password);
  return okUsuario && okPassword;
}

function crearToken() {
  const expira = Date.now() + config.admin.horasSesion * 3600 * 1000;
  const datos = `${expira}`;
  return `${datos}.${firmar(datos)}`;
}

function tokenValido(token) {
  if (!token || typeof token !== 'string') return false;
  const [datos, firma] = token.split('.');
  if (!datos || !firma) return false;
  if (!igualSeguro(firma, firmar(datos))) return false;
  return Number(datos) > Date.now();
}

function leerCookie(req, nombre) {
  const header = req.headers.cookie || '';
  for (const parte of header.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return null;
}

function iniciarSesion(res) {
  res.cookie(COOKIE, crearToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.produccion,
    maxAge: config.admin.horasSesion * 3600 * 1000,
    path: '/',
  });
}

function cerrarSesion(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function requiereAdmin(req, res, next) {
  if (tokenValido(leerCookie(req, COOKIE))) return next();
  res.status(401).json({ error: 'Inicia sesión para continuar.' });
}

module.exports = { credencialesValidas, iniciarSesion, cerrarSesion, requiereAdmin, leerCookie, igualSeguro };
