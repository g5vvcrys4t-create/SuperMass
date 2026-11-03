// Genera la imagen Open Graph (1200x630) con el logo, el premio y la fecha.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('./config');

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

// Parte un texto en renglones de máximo `max` caracteres.
function renglones(texto, max, limite) {
  const palabras = String(texto).split(/\s+/);
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    if ((actual + ' ' + p).trim().length > max && actual) {
      lineas.push(actual);
      actual = p;
    } else {
      actual = (actual + ' ' + p).trim();
    }
  }
  if (actual) lineas.push(actual);
  if (lineas.length > limite) {
    lineas.length = limite;
    lineas[limite - 1] = lineas[limite - 1].replace(/.{0,3}$/, '…');
  }
  return lineas;
}

function logoDataUri() {
  const dir = path.join(__dirname, '..', 'public', 'img');
  for (const [archivo, mime] of [['logo.png', 'image/png'], ['logo.jpg', 'image/jpeg'], ['logo.svg', 'image/svg+xml']]) {
    const ruta = path.join(dir, archivo);
    if (fs.existsSync(ruta)) return `data:${mime};base64,${fs.readFileSync(ruta).toString('base64')}`;
  }
  return null;
}

let cache = null;

async function imagenOg() {
  if (cache) return cache;
  const { nombre, premio, fecha } = config.rifa;
  const fuente = "'DejaVu Sans', 'Arial Rounded MT Bold', Arial, Helvetica, sans-serif";
  const lineasPremio = renglones(premio, 22, 2);
  const tamPremio = lineasPremio.length > 1 ? 58 : 68;
  const logo = logoDataUri();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#E5232A"/><stop offset=".55" stop-color="#D7141A"/><stop offset="1" stop-color="#9E0F14"/>
    </linearGradient>
    <filter id="difumina" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="60"/></filter>
    <linearGradient id="vidrio" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#fondo)"/>
  <circle cx="1040" cy="120" r="190" fill="#FFD200" opacity=".55" filter="url(#difumina)"/>
  <circle cx="160" cy="560" r="220" fill="#9E0F14" opacity=".9" filter="url(#difumina)"/>
  <circle cx="620" cy="640" r="160" fill="#FFD200" opacity=".35" filter="url(#difumina)"/>
  <rect x="60" y="60" width="1080" height="510" rx="44" fill="url(#vidrio)" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>
  <rect x="62" y="62" width="1076" height="120" rx="42" fill="#fff" opacity=".07"/>
  ${logo ? `<image href="${logo}" x="100" y="96" width="380" height="140" preserveAspectRatio="xMinYMid meet"/>` :
    `<text x="100" y="190" font-family="${fuente}" font-weight="900" font-size="92" fill="#fff">SUPERMASS</text>`}
  <text x="100" y="300" font-family="${fuente}" font-weight="800" font-size="44" fill="#FFD200">${esc(nombre)}</text>
  <text x="100" y="352" font-family="${fuente}" font-weight="600" font-size="28" fill="#fff" opacity=".9">PREMIO PRINCIPAL</text>
  ${lineasPremio.map((l, i) => `<text x="100" y="${420 + i * (tamPremio + 6)}" font-family="${fuente}" font-weight="900" font-size="${tamPremio}" fill="#fff">${esc(l)}</text>`).join('\n  ')}
  <rect x="100" y="${lineasPremio.length > 1 ? 498 : 462}" width="${Math.min(980, 64 + (`Sorteo: ${fecha}`).length * 16.5)}" height="58" rx="29" fill="#FFD200"/>
  <text x="130" y="${lineasPremio.length > 1 ? 537 : 501}" font-family="${fuente}" font-weight="800" font-size="28" fill="#5A0A0D">Sorteo: ${esc(fecha)}</text>
  <text x="1100" y="160" text-anchor="end" font-family="${fuente}" font-weight="800" font-size="30" fill="#fff">¡Registra tu ticket!</text>
</svg>`;

  cache = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return cache;
}

module.exports = { imagenOg };
