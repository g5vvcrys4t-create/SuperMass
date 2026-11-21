// Conexión con la página de Facebook: trae las últimas publicaciones para mostrarlas en la web.
// Requiere FACEBOOK_PAGE_ID y FACEBOOK_PAGE_TOKEN (token de página, de preferencia permanente).
const GRAPH = 'https://graph.facebook.com/v21.0';
const CACHE_MS = 10 * 60 * 1000; // 10 minutos: no gastamos llamadas a Facebook en cada visita

const pageId = () => (process.env.FACEBOOK_PAGE_ID || '').trim();
const token = () => (process.env.FACEBOOK_PAGE_TOKEN || '').trim();

let cache = { t: 0, datos: [] };
let avisoError = 0;

async function publicaciones() {
  if (!pageId() || !token()) return [];
  if (Date.now() - cache.t < CACHE_MS) return cache.datos;
  try {
    const url = `${GRAPH}/${encodeURIComponent(pageId())}/posts?fields=id,message,full_picture,permalink_url,created_time&limit=12&access_token=${encodeURIComponent(token())}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const json = await resp.json();
    if (json.error) throw new Error(json.error.message);
    const datos = (json.data || [])
      .filter((p) => p.full_picture) // en la web solo mostramos publicaciones con foto
      .slice(0, 6)
      .map((p) => ({
        id: p.id,
        texto: (p.message || '').trim().slice(0, 280),
        imagen: p.full_picture,
        enlace: p.permalink_url,
        fecha: p.created_time,
      }));
    cache = { t: Date.now(), datos };
    return datos;
  } catch (err) {
    // Si el token caducó seguimos mostrando lo último que teníamos y avisamos en el log (máx. 1 vez por hora).
    if (Date.now() - avisoError > 3600 * 1000) {
      console.warn('⚠️  Facebook: no se pudieron leer las publicaciones:', err.message);
      avisoError = Date.now();
    }
    cache.t = Date.now() - CACHE_MS + 60 * 1000; // reintenta en 1 minuto
    return cache.datos;
  }
}

// Publica en la página. Con foto usa /photos (el texto va como pie de foto); sin foto usa /feed.
async function publicar({ mensaje, enlace, foto }) {
  if (!pageId() || !token()) throw Object.assign(new Error('Facebook no está conectado: falta FACEBOOK_PAGE_ID o FACEBOOK_PAGE_TOKEN.'), { status: 503 });
  const form = new FormData();
  form.append('access_token', token());
  let ruta;
  if (foto) {
    ruta = 'photos';
    form.append('caption', enlace ? `${mensaje}\n\n👉 ${enlace}` : mensaje);
    form.append('source', new Blob([foto.buffer], { type: foto.mime }), 'foto.jpg');
  } else {
    ruta = 'feed';
    form.append('message', mensaje);
    if (enlace) form.append('link', enlace);
  }
  const resp = await fetch(`${GRAPH}/${encodeURIComponent(pageId())}/${ruta}`, { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
  const json = await resp.json().catch(() => ({}));
  if (json.error) {
    const caduco = json.error.code === 190;
    throw Object.assign(new Error(caduco
      ? 'El token de Facebook caducó. Pon un token de página permanente en FACEBOOK_PAGE_TOKEN.'
      : `Facebook rechazó la publicación: ${json.error.message}`), { status: 502 });
  }
  cache.t = 0; // que la web muestre la nueva publicación en la siguiente visita
  const id = json.post_id || json.id;
  return { id, enlace: id ? `https://www.facebook.com/${id}` : null };
}

module.exports = { publicaciones, publicar, conectado: () => !!(pageId() && token()), pageId };
