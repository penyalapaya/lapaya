# Peña La Paya

Web de gestión de las fiestas de la peña. HTML + CSS + JavaScript, sin framework.
Base de datos en [Supabase](https://supabase.com) (Postgres gratuito).

- **Web pública:** https://lapaya.webprofes.com
- **Administración:** https://lapaya.webprofes.com/admin.html

## Estructura

```
index.html        Web pública: hoy, calendario, turnos, cuentas, lo mío, cobros
admin.html        Panel de administración, protegido por PIN
css/style.css     Estilos
js/config.js      URL y clave pública de Supabase   <-- configurar aquí
js/core.js        Conexión, carga de datos y cálculo de cuentas
js/publico.js     Lógica de la web pública
js/admin.js       Lógica del panel de administración
sql/schema.sql    Esquema de la base de datos
CNAME             Dominio personalizado de GitHub Pages
```

## Puesta en marcha

1. En Supabase: **SQL Editor** → pegar y ejecutar `sql/schema.sql`.
2. En Supabase: **Authentication → Users → Add user**, con el correo `admin@lapaya.com`
   y como contraseña el PIN. Marcar *Auto Confirm User*.
3. Copiar la clave pública de **Project Settings → API Keys** y pegarla en `js/config.js`.
4. `git push`. GitHub Pages publica en un minuto.

## Cómo funcionan los cobros

- El **admin** (con PIN) gestiona personas, días, precios, apuntes, turnos y gastos.
- Cada **turno de cocina** genera un código-palabra. El cocinero lo introduce en la
  pestaña *Cobros* y marca quién le ha pagado esa comida.
- El **tesorero** tiene su propio código (en *Ajustes*) para anotar los pagos de los
  gastos generales.
- Los **invitados** pagan sus comidas y cenas, pero nunca gastos generales.
