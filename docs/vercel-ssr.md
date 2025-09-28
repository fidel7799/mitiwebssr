# Despliegue SSR de Angular en Vercel

Esta aplicación ya está preparada para renderizado del lado del servidor (SSR) usando `@angular/ssr`. Para que Vercel utilice ese renderizado dinámico, necesitas indicarle cómo construir y qué handler invocar.

## Pasos recomendados

1. **Variables de entorno**  
   No son obligatorias para SSR, pero puedes fijar `NODE_ENV=production` o cualquier variable consumida por Express.

2. **Configurar `vercel.json`**  
   Añade un archivo con el siguiente contenido en la raíz del repositorio:

   ```json
   {
     "version": 3,
     "framework": null,
     "buildCommand": "npm run build",
     "outputDirectory": "dist/mitiwebssr",
     "functions": {
       "api/server.js": {
         "runtime": "nodejs20.x"
       }
     },
     "routes": [
       { "src": "/assets/(.*)", "dest": "/dist/mitiwebssr/browser/assets/$1" },
       { "src": "/favicon.ico", "dest": "/dist/mitiwebssr/browser/favicon.ico" },
       { "src": "/(.*)", "dest": "/api/server.js" }
     ]
   }
   ```

   La ruta final delega todas las peticiones dinámicas al handler SSR.

3. **Crear el handler serverless**  
   Crea `api/server.ts` con:

   ```ts
   import { createRequestHandler } from '@angular/ssr/vercel';
   import bootstrap from '../dist/mitiwebssr/server/main.server.mjs';

   export default createRequestHandler({ build: bootstrap });
   ```

   Vercel transpilará el archivo TypeScript automáticamente si tienes `@vercel/node`. Si prefieres JavaScript nativo, compila el archivo previamente o crea `api/server.mjs` importando el bundle emitido.

4. **Redeploy**  
   Vuelve a desplegar (`vercel --prod`) para que se aplique la configuración.

## Cómo verificar que SSR está activo

- Ejecuta `curl -I https://tu-dominio.vercel.app` y valida que la cabecera `x-vercel-cache` sea `MISS` o `REVALIDATED` en la primera petición.
- Usa `curl https://tu-dominio.vercel.app` (sin `-I`) y revisa que el HTML inicial contenga el contenido renderizado (no solo `<app-root></app-root>`).
- En el dashboard de Vercel, abre **Functions** y comprueba que el endpoint `api/server` se esté ejecutando.

## Consejos adicionales

- Para rutas protegidas puedes aprovechar los `Edge Functions` solo si no necesitas el motor de Angular; la configuración anterior usa lambdas Node.js.
- Si usas navegación con datos dinámicos, activa `provideClientHydration` (ya incluido) para evitar discrepancias entre servidor y cliente.
- Repite el `npm run build` localmente antes de desplegar para asegurarte de que el bundle de servidor (`dist/mitiwebssr/server`) se genera sin errores.
