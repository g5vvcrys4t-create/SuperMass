// Reglas del Club SuperMass. Edita aquí puntos, niveles y recompensas.
//
// Lógica de negocio (por qué estos números):
// - 1 punto por cada $10 => el cliente "ve" que cada compra suma, y el costo real
//   para la tienda queda entre 2% y 4% de lo vendido (las recompensas se pagan a
//   precio de costo, el cliente las percibe a precio de venta).
// - Los niveles premian la frecuencia: quien ya compra aquí tiene una razón para
//   no irse a la competencia ("ya casi llego a Consentido").
// - El bono de bienvenida hace que el cliente se registre HOY; el de referido
//   convierte a cada socio en vendedor de la tienda.

module.exports = {
  pesosPorPunto: 10,          // cada $10 de compra = 1 punto
  bienvenida: 20,             // puntos al crear la tarjeta
  referido: 30,               // para los dos, cuando el invitado hace su primera compra
  opinion: 5,                 // por dejar una opinión en el buzón (socios con sesión)
  opinionCadaDias: 7,         // máximo una opinión premiada cada 7 días
  cumpleMultiplicador: 2,     // puntos dobles en el mes de tu cumpleaños
  compraMaxima: 10000,        // tope por ticket en caja (evita errores de dedo)

  niveles: [
    { id: 'vecino', nombre: 'Vecino', desde: 0, multiplicador: 1, envioGratis: false,
      beneficios: ['1 punto por cada $10', '20 puntos de regalo al unirte', 'Puntos dobles en tu mes de cumpleaños'] },
    { id: 'frecuente', nombre: 'Frecuente', desde: 300, multiplicador: 1.25, envioGratis: false,
      beneficios: ['25% más puntos en cada compra', 'Todo lo del nivel Vecino'] },
    { id: 'consentido', nombre: 'Consentido', desde: 1000, multiplicador: 1.5, envioGratis: true,
      beneficios: ['50% más puntos en cada compra', 'Envío a domicilio gratis', 'Todo lo del nivel Frecuente'] },
  ],

  // id: no lo cambies una vez que haya canjes; nombre y puntos sí.
  recompensas: [
    { id: 'papas', nombre: 'Papas o galletas', detalle: 'Bolsa individual de tu marca favorita', puntos: 35 },
    { id: 'refresco', nombre: 'Refresco de 600 ml', detalle: 'El sabor que quieras', puntos: 40 },
    { id: 'huevo', nombre: 'Kilo de huevo', detalle: 'Blanco o rojo', puntos: 110 },
    { id: 'desc25', nombre: '$25 de descuento', detalle: 'En tu siguiente compra', puntos: 120 },
    { id: 'despensa', nombre: 'Despensa básica', detalle: 'Aceite, arroz, frijol y azúcar', puntos: 500 },
  ],

  // Pedidos
  pedidoMinimo: 100,          // pesos
  costoEnvio: 20,             // pesos; 0 = gratis para todos
};
