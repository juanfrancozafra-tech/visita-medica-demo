# Publicar la demo (GitHub + Cloudflare)

Sin terminal: todo desde GitHub Desktop y el panel de Cloudflare. Toma unos 15 minutos y se hace una sola vez.
La demo no necesita secretos: el PIN (`1234`) y el modo demo ya vienen en `wrangler.toml`.

## 1. Cloudflare: base de datos y bucket
1. Cloudflare → **Storage & Databases → D1** → *Create* → nombre `visita-demo-db`.
2. Copia el **Database ID** y pégalo en `wrangler.toml`, en la línea `database_id` (reemplaza los ceros). Puedes abrir el archivo con TextEdit.
3. Cloudflare → **R2** → *Create bucket* → nombre `visita-demo-soportes`.

## 2. GitHub Desktop: repositorio público
1. *File → Add Local Repository…* → elige la carpeta `visita-medica-demo`.
2. Dirá que no es un repositorio: clic en **create a repository** → nombre `visita-medica-demo` → *Create repository*.
3. Escribe el mensaje "Primera versión" → **Commit to main**.
4. **Publish repository** → **quita la marca de "Keep this code private"** → *Publish*.

## 3. Cloudflare Pages: desplegar
1. **Workers & Pages → Create → Pages → Connect to Git** → elige `visita-medica-demo`.
2. Nombre del proyecto: `visita-medica-demo` (define la URL `visita-medica-demo.pages.dev`).
3. Framework: *None*. Build command: vacío. Build output directory: `public`.
4. *Save and Deploy*.

## 4. Probar
1. Abre `https://visita-medica-demo.pages.dev` e ingresa con el PIN **1234**.
2. La primera vez tarda un par de segundos: está sembrando los datos de ejemplo.
3. Si Cloudflare te dio otra URL (porque el nombre estaba tomado), cámbiala en el README y haz commit.

## Mantenimiento
- Cada push a `main` vuelve a desplegar.
- Los datos se reinician solos al primer ingreso de cada día (hora de Colombia) y con el botón **Reiniciar**.
- Para usar la IA real en vez de la simulada: `DEMO_MODE = "0"`, agregar el secreto `ANTHROPIC_API_KEY` en Pages → Settings → Variables and Secrets, quitar los `#` de `[ai]` en `wrangler.toml` y mover `APP_PIN` a un secreto.
