# Next Ezeiza — Guía de Setup y Deploy

## Requisitos previos
- Node.js 18+ instalado → https://nodejs.org
- Cuenta en Supabase → https://supabase.com
- Cuenta en Vercel → https://vercel.com
- Cuenta en GitHub → https://github.com

---

## PASO 1 — Base de datos en Supabase

1. Entrá a https://supabase.com y creá un proyecto nuevo
   - Nombre: `next-ezeiza`
   - Región: South America (São Paulo) — la más cercana a Argentina
   - Guardá la contraseña de la base de datos

2. Ejecutar el schema:
   - Ir a **SQL Editor** → **New Query**
   - Copiar y pegar el contenido de `sql/01_schema.sql`
   - Clic en **Run**

3. Cargar datos iniciales:
   - Nueva query
   - Copiar y pegar `sql/02_seed.sql`
   - Clic en **Run**

4. Crear usuarios en Supabase Auth:
   - Ir a **Authentication** → **Users** → **Add user**
   - Crear los siguientes usuarios:

   | Email                          | Contraseña | Rol          |
   |-------------------------------|------------|--------------|
   | director@nextezeiza.edu       | (elegí vos)| director     |
   | laura@nextezeiza.edu          | (elegí vos)| coordinadora |
   | maria@nextezeiza.edu          | (elegí vos)| secretaria   |
   | ana@nextezeiza.edu            | (elegí vos)| profesora    |

   > Al crear cada usuario, en "User metadata" agregar: `{"nombre": "Director", "rol": "director"}`
   > (ajustar nombre y rol para cada uno)

5. Copiar tus credenciales:
   - Ir a **Project Settings** → **API**
   - Copiar `Project URL` y `anon public key`

---

## PASO 2 — Configurar el proyecto local

```bash
# Clonar o descomprimir el proyecto
cd next-ezeiza

# Instalar dependencias
npm install

# Crear archivo de variables de entorno
cp .env.example .env.local
```

Editar `.env.local` con tus datos de Supabase:
```
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

```bash
# Probar localmente
npm run dev
# Abrir http://localhost:3000
```

---

## PASO 3 — Subir a GitHub

```bash
# Inicializar repositorio
git init
git add .
git commit -m "Next Ezeiza — primera versión"

# Crear repo en GitHub (desde github.com → New repository)
# Nombre: next-ezeiza
# Privado recomendado

git remote add origin https://github.com/TU-USUARIO/next-ezeiza.git
git branch -M main
git push -u origin main
```

---

## PASO 4 — Deploy en Vercel

1. Ir a https://vercel.com → **Add New Project**
2. Importar el repositorio `next-ezeiza` de GitHub
3. En **Environment Variables**, agregar:
   - `NEXT_PUBLIC_SUPABASE_URL` → tu URL de Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → tu anon key
4. Clic en **Deploy**
5. En 2-3 minutos la app está en vivo en `next-ezeiza.vercel.app`

---

## PASO 5 — Dominio propio (opcional)

1. Registrar `nextezeiza.com` en Namecheap (~$12 USD/año)
   o `nextezeiza.edu.ar` en NIC Argentina (~$350 ARS/año)

2. En Vercel → tu proyecto → **Domains** → agregar tu dominio
3. Seguir las instrucciones para apuntar los DNS
4. SSL se configura automáticamente (gratis)

---

## Costos estimados

| Servicio          | Costo        |
|------------------|--------------|
| Vercel            | Gratis       |
| Supabase          | Gratis (hasta 500MB y 50.000 users) |
| Dominio .com      | ~$12 USD/año |
| **Total**         | **~$1 USD/mes** |

---

## Actualizaciones futuras

Cada vez que hagas cambios al código:
```bash
git add .
git commit -m "descripción del cambio"
git push
```
Vercel detecta el push y hace el deploy automáticamente en ~2 minutos.

---

## Soporte

Ante cualquier problema, el código está organizado en:
- `src/lib/supabase.ts` → tipos y cliente de base de datos
- `src/lib/auth-context.tsx` → manejo de sesión
- `src/lib/hooks.ts` → acceso a datos (agregar, editar, listar)
- `src/components/pages/` → cada módulo de la app
