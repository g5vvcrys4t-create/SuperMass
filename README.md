# SuperMass · Club de clientes, pedidos y rifa

## Club SuperMass (nuevo)

- **Inicio** (`/`): página de venta del club con calculadora de premios, niveles, pedidos y buzón.
- **Mi tarjeta** (`/club`): el cliente crea su tarjeta con celular + NIP, ve sus puntos, canjea premios (recibe un código de 6 letras) e invita vecinos.
- **Pedidos** (`/pedido`): catálogo con carrito; el pedido se guarda en el panel y se manda por WhatsApp a la tienda.
- **Buzón** (`/buzon`): quejas, sugerencias, felicitaciones y productos que piden los clientes.
- **Panel** (`/admin`): *Caja* (sumar puntos por celular, dar de alta clientes, entregar premios por código), *Pedidos* (con aviso de pedidos nuevos), *Socios*, *Productos* y *Buzón*.

Reglas de puntos, niveles y premios: `src/programa.js` (1 punto por cada $10, 20 de bienvenida, 30 por invitar, x2 en el mes de cumpleaños).

## Rifa

Página de registro de tickets para la rifa de **SuperMass Abarrotes · Cerca de ti**, con panel de administrador y tómbola animada. Estilo *Liquid Glass*, pensada primero para celular.

- **Público** (`/rifa`): registro con folio, nombre, teléfono, foto del ticket y aviso de privacidad. Confirmación en verde con botones para compartir en Facebook y WhatsApp.
- **Administrador** (`/admin`): búsqueda, revisión de fotos (Validar / Rechazar con avance automático al siguiente pendiente), exportar CSV para Excel, tómbola y historial de ganadores.
- **Facebook**: etiquetas Open Graph y una imagen de 1200×630 que se genera sola en `/og.png` con el logo, el premio y la fecha.

## Requisitos

- Node.js 18 o más reciente
- PostgreSQL (Render, Supabase o local)

## Probar en tu compu

```bash
npm install
cp .env.example .env   # edita los valores
npm run dev
```

Abre http://localhost:3000 y http://localhost:3000/admin.
Si dejas `DATABASE_URL` vacía, se usa una base **en memoria** (los datos se borran al reiniciar); sirve solo para pruebas.

## Logo

El logo incluido (`public/img/logo.svg`) es provisional. Para usar el oficial, copia el archivo como **`public/img/logo.png`** (de preferencia con fondo transparente); la página y la imagen de Facebook lo toman automáticamente.

## Variables de entorno

| Variable | Para qué sirve |
| --- | --- |
| `DATABASE_URL` | Conexión a PostgreSQL. En Supabase usa la cadena de conexión "URI". |
| `DB_SSL` | `auto` (por defecto), `true` o `false`. |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Acceso al panel. Sin contraseña, el panel queda desactivado. |
| `SESSION_SECRET` | Texto largo y aleatorio para firmar la sesión (`openssl rand -hex 32`). |
| `PUBLIC_URL` | URL final de la página, p. ej. `https://supermass-rifa.onrender.com`. Necesaria para Facebook. |
| `RIFA_NOMBRE`, `RIFA_PREMIO`, `RIFA_FECHA` | Textos de la rifa (encabezado, Facebook e imagen). |
| `REGISTRO_ABIERTO` | `false` para cerrar el registro. |
| `TIENDA_DIRECCION`, `TIENDA_RESPONSABLE`, `TIENDA_CORREO`, `FACEBOOK_URL` | Pie de página y aviso de privacidad. |
| `LIMITE_IP_MINUTO` | Registros máximos por IP por minuto (5). |
| `LIMITE_POR_TELEFONO` | Tickets máximos por teléfono en total (10). |
| `LIMITE_TELEFONO_MINUTO` | Tickets máximos por teléfono por minuto (2). |
| `LIMITE_FOTO_MB` | Peso máximo de la foto (10 MB). |
| `TIENDA_WHATSAPP` | WhatsApp de la tienda a 10 dígitos; ahí llegan los pedidos. |
| `TIENDA_HORARIO`, `TIENDA_ZONA_ENVIO` | Se muestran en inicio y pedidos. |
| `OG_IMAGE_URL` | Opcional: tu propia imagen para Facebook en lugar de la generada. |
| `ZONA_HORARIA` | Zona para las fechas del CSV (`America/Mexico_City`). |

## Subir a GitHub (repo `Super-Mass`)

```bash
git init
```

```bash
git add . && git commit -m "Rifa SuperMass: registro, panel y tómbola"
```

```bash
git branch -M main && git remote add origin https://github.com/TU_USUARIO/Super-Mass.git && git push -u origin main
```

## Desplegar en Render

1. En Render: **New → Blueprint** y elige el repo `Super-Mass`. El archivo `render.yaml` crea el servicio web y la base PostgreSQL.
2. Cuando lo pida, llena `ADMIN_PASSWORD`, `PUBLIC_URL`, `TIENDA_DIRECCION` y `FACEBOOK_URL`.
3. Al terminar, abre `https://TU-SERVICIO.onrender.com/admin`.

¿Prefieres Supabase? Crea el proyecto, copia la cadena de conexión en `DATABASE_URL` y quita el bloque `databases` de `render.yaml`. Las tablas se crean solas al arrancar.

> El plan gratis de Render "se duerme" sin visitas y su base de datos gratis expira a los 30 días. Para la rifa real conviene un plan de pago o Supabase.

### Revisar la tarjeta de Facebook

Después de publicar, pega tu URL en el [Depurador de compartir de Facebook](https://developers.facebook.com/tools/debug/) y presiona **Volver a extraer** para que tome la imagen y los textos nuevos.

## Cómo funciona

- **Tickets únicos**: el folio tiene índice `UNIQUE` en la base; un segundo registro con el mismo número se rechaza. Ojo: `004512` y `4512` cuentan como folios distintos.
- **Fotos**: se reducen a máx. 1600 px en JPEG y se guardan en PostgreSQL (columna `BYTEA`), así no se pierden cuando Render reinicia el servidor.
- **Antispam**: límite por IP y por teléfono, más un campo trampa invisible para bots.
- **Estados**: todo registro nace como *Pendiente*; solo los *Validados* entran a la tómbola.
- **Tómbola**: el servidor elige al ganador con `crypto.randomInt` entre los validados que siguen en la tómbola, y lo guarda en el historial antes de la animación. Si marcas "Sacar al ganador", ya no participa en los siguientes premios; desde *Ganadores* puedes regresarlo.
- **Pantalla en vivo**: el teléfono del ganador se muestra como `•• •••• 1234`. En el historial puedes ver el número completo con "Ver teléfono".
- **Accesibilidad**: foco visible con teclado, errores anunciados a lectores de pantalla, respeta "reducir movimiento" (la tómbola revela los dígitos sin giros ni confeti) y "más contraste".

## Estructura

```
server.js              Servidor Express y API
src/config.js          Variables de entorno
src/db.js              PostgreSQL y esquema
src/auth.js            Sesión del administrador
src/og.js              Imagen para Facebook
public/index.html      Página pública
public/admin.html      Panel y tómbola
public/aviso-privacidad.html
public/css/, public/js/, public/img/
render.yaml            Despliegue en Render
```
