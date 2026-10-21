# Las Perras & Compañía

Propuesta web estática del restaurante en Bogotá, con carta completa, identidad visual, buscador y carrito conectado a WhatsApp.

[Ver la propuesta alojada](https://las-perras-compania-propuesta.giving-lynx-1571.chatgpt.site). El acceso al sitio de demostración sigue siendo privado.

## Funciones

- 55 productos en 10 categorías, precios y opciones de la carta PDF.
- Fotos e imágenes de referencia identificadas en la interfaz.
- Sabores, variantes, adicional de salchicha, cantidades y notas.
- Carrito conservado en el navegador y resumen con precios calculados desde el catálogo.
- Botón para finalizar por WhatsApp y opción para copiar el pedido.

## Ejecutar localmente

Requiere Node.js. No necesita instalar dependencias ni compilar.

```bash
node preview.mjs
```

Abrir http://127.0.0.1:4317. Para alojarlo en otro servicio, publicar el contenido de `dist/`.

## GitHub Pages

El flujo `.github/workflows/pages.yml` comprueba el catálogo y el carrito antes de publicar únicamente `dist/`. En **Settings → Pages → Build and deployment → Source**, seleccionar **GitHub Actions**. Después, ejecutar el flujo desde **Actions** o enviar un cambio a `main`.

La dirección prevista es `https://listoia21-pixel.github.io/las-perras-compania/`; estará disponible cuando Pages esté habilitado y el despliegue termine correctamente. Un repositorio privado requiere un plan compatible con Pages. Los recursos usan rutas relativas para funcionar bajo `/las-perras-compania/`.

## Comprobaciones

Desde la raíz del repositorio:

```bash
node check.mjs
node --test cart.test.mjs
```

Las pruebas verifican catálogo, precios, variantes, adicionales, almacenamiento y el enlace a WhatsApp, incluidas tildes y emojis. No envían mensajes.

## WhatsApp de pruebas

Editar `dist/order-config.js` para cambiar `whatsappNumber`, `displayNumber` y `testMode`. El número se escribe con indicativo internacional, sin el signo `+` ni espacios.

La configuración actual apunta al número de pruebas del propietario: **+57 322 229 0244**, con `testMode: true`. Antes de entregar al restaurante, sustituirlo por su número oficial y desactivar ese modo.

El cliente revisa el mensaje y pulsa **Enviar** dentro de WhatsApp. La página conserva el carrito y no acredita entrega ni confirmación del restaurante. No hay pagos, backend de pedidos ni integración con WhatsApp Business API.

## Archivos principales

| Archivo | Uso |
| --- | --- |
| `dist/index.html` | Estructura de la página |
| `dist/app.js` | Menú, modales, búsqueda y carrito |
| `dist/cart-model.js` | Cantidades, opciones, importes y resumen |
| `dist/order-config.js` | Destino de WhatsApp y modo de pruebas |
| `dist/catalog.js` | Catálogo que utiliza la interfaz |
| `fixtures/menu-pdf.json` | Transcripción verificada para las pruebas |
| `PHOTO-SOURCES.json` | Procedencia y clasificación de las imágenes |

Los nombres y precios se actualizan en el catálogo y en la referencia verificada cuando cambie la carta.

## Recursos y autoría

La carta PDF, los logotipos, las fotografías y las ilustraciones corresponden a sus respectivos titulares. El uso comercial del material debe validarse con el restaurante. Las imágenes ilustrativas están identificadas como tales. Los orígenes y los prompts utilizados se registran en `PHOTO-SOURCES.json`.

Se conserva la licencia de Road Rage en `dist/assets/OFL-RoadRage.txt`. Este repositorio no otorga una licencia general sobre los recursos de terceros.
