// Genera las imágenes para Facebook (1200x630): una por página (rifa, club, pedidos, buzón, inicio).
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

// Tarjeta de 1200x630 con el mismo diseño para todas las páginas.
function tarjetaSvg({ titulo, sub, principal, pastilla, etiqueta, logo }) {
  const fuente = "'DejaVu Sans', 'Arial Rounded MT Bold', Arial, Helvetica, sans-serif";
  const lineas = renglones(principal, 22, 2);
  const tam = lineas.length > 1 ? 58 : 68;
  const textoPastilla = String(pastilla || '').slice(0, 56);
  const yPastilla = lineas.length > 1 ? 498 : 462;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#D11A22"/><stop offset=".55" stop-color="#C00812"/><stop offset="1" stop-color="#8A0A10"/>
    </linearGradient>
    <filter id="difumina" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="60"/></filter>
    <linearGradient id="vidrio" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#fondo)"/>
  <circle cx="1040" cy="120" r="190" fill="#EBDA52" opacity=".55" filter="url(#difumina)"/>
  <circle cx="160" cy="560" r="220" fill="#8A0A10" opacity=".9" filter="url(#difumina)"/>
  <circle cx="620" cy="640" r="160" fill="#EBDA52" opacity=".35" filter="url(#difumina)"/>
  <rect x="60" y="60" width="1080" height="510" rx="44" fill="url(#vidrio)" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>
  <rect x="62" y="62" width="1076" height="120" rx="42" fill="#fff" opacity=".07"/>
  ${logo ? `<image href="${logo}" x="100" y="96" width="380" height="140" preserveAspectRatio="xMinYMid meet"/>` :
    `<text x="100" y="190" font-family="${fuente}" font-weight="900" font-size="92" fill="#fff">SUPERMASS</text>`}
  <text x="100" y="300" font-family="${fuente}" font-weight="800" font-size="44" fill="#EBDA52">${esc(titulo)}</text>
  <text x="100" y="352" font-family="${fuente}" font-weight="600" font-size="28" fill="#fff" opacity=".9">${esc(sub)}</text>
  ${lineas.map((l, i) => `<text x="100" y="${420 + i * (tam + 6)}" font-family="${fuente}" font-weight="900" font-size="${tam}" fill="#fff">${esc(l)}</text>`).join('\n  ')}
  ${textoPastilla ? `<rect x="100" y="${yPastilla}" width="${Math.min(980, 64 + textoPastilla.length * 16.5)}" height="58" rx="29" fill="#EBDA52"/>
  <text x="130" y="${yPastilla + 39}" font-family="${fuente}" font-weight="800" font-size="28" fill="#4A060A">${esc(textoPastilla)}</text>` : ''}
  <text x="1100" y="160" text-anchor="end" font-family="${fuente}" font-weight="800" font-size="30" fill="#fff">${esc(etiqueta)}</text>
</svg>`;
}

// Qué dice la imagen de cada página.
function contenido(tipo) {
  const { nombre, premio, fecha } = config.rifa;
  const club = require('./club').publico();
  switch (tipo) {
    case 'club':
      return {
        titulo: 'Club SuperMass', sub: 'TARJETA DE PUNTOS GRATIS',
        principal: `${club.bienvenida} puntos de regalo al unirte`,
        pastilla: `1 punto por cada $${club.pesosPorPunto} de compra`, etiqueta: '¡Crea tu tarjeta!',
      };
    case 'pedido':
      return {
        titulo: 'SuperMass a domicilio', sub: 'PEDIDOS POR WHATSAPP',
        principal: 'Haz tu pedido desde tu celular',
        pastilla: config.tienda.horario, etiqueta: '¡Pide ya!',
      };
    case 'buzon':
      return {
        titulo: 'Buzón SuperMass', sub: 'QUEJAS Y SUGERENCIAS',
        principal: 'Tu opinión cuenta',
        pastilla: 'Dinos qué mejorar o qué producto buscas', etiqueta: '¡Escríbenos!',
      };
    case 'inicio':
      return {
        titulo: 'Club SuperMass', sub: 'ABARROTES · CERCA DE TI',
        principal: 'Cada compra te regresa premios',
        pastilla: `${club.bienvenida} puntos gratis al unirte`, etiqueta: 'Pedidos a domicilio',
      };
    default:
      return {
        titulo: nombre, sub: 'PREMIO PRINCIPAL',
        principal: premio,
        pastilla: `Sorteo: ${fecha}`, etiqueta: '¡Registra tu ticket!',
      };
  }
}

const TIPOS = ['rifa', 'club', 'pedido', 'buzon', 'inicio'];
const cache = {};

async function imagenOg(tipo = 'rifa') {
  if (!TIPOS.includes(tipo)) tipo = 'rifa';
  if (!cache[tipo]) {
    const svg = tarjetaSvg({ ...contenido(tipo), logo: logoDataUri() });
    cache[tipo] = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  }
  return cache[tipo];
}

module.exports = { imagenOg, TIPOS };
