// Configuración central: todo sale de variables de entorno (ver .env.example).
const env = process.env;

const numero = (valor, porDefecto) => {
  const n = parseInt(valor, 10);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
};

module.exports = {
  port: numero(env.PORT, 3000),
  produccion: env.NODE_ENV === 'production',
  publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),

  rifa: {
    nombre: env.RIFA_NOMBRE || 'Gran Rifa Navideña SuperMass',
    premio: env.RIFA_PREMIO || 'Una despensa de $5,000',
    fecha: env.RIFA_FECHA || 'Sábado 19 de diciembre de 2026',
    registroAbierto: env.REGISTRO_ABIERTO !== 'false',
  },

  tienda: {
    direccion: env.TIENDA_DIRECCION || 'Av. Principal #123, Col. Centro, C.P. 00000',
    facebook: env.FACEBOOK_URL || 'https://www.facebook.com/',
    responsable: env.TIENDA_RESPONSABLE || 'SuperMass Abarrotes',
    correo: env.TIENDA_CORREO || '',
    // WhatsApp de la tienda a 10 dígitos (se le antepone 52). Vacío = sin botón de WhatsApp.
    whatsapp: (env.TIENDA_WHATSAPP || '').replace(/\D/g, '').slice(-10),
    telefono: (env.TIENDA_TELEFONO || '').replace(/\D/g, '').slice(-10),
    horario: env.TIENDA_HORARIO || 'Todos los días de 7:00 a 23:00',
    zonaEnvio: env.TIENDA_ZONA_ENVIO || 'Colonias cercanas a la tienda',
  },

  admin: {
    usuario: env.ADMIN_USER || 'admin',
    password: env.ADMIN_PASSWORD || '',
    sessionSecret: env.SESSION_SECRET || '',
    horasSesion: numero(env.ADMIN_HORAS_SESION, 12),
  },

  limites: {
    registrosPorIpMinuto: numero(env.LIMITE_IP_MINUTO, 5),
    registrosPorTelefono: numero(env.LIMITE_POR_TELEFONO, 10),
    registrosPorTelefonoMinuto: numero(env.LIMITE_TELEFONO_MINUTO, 2),
    tamanoFotoMb: numero(env.LIMITE_FOTO_MB, 10),
  },

  ogImageUrl: env.OG_IMAGE_URL || '',
};
