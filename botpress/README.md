# Integración Botpress v12 con la API de NestJS

Esta guía describe cómo registrar y usar la Action personalizada `get_live_menu.js` en **Botpress Studio** (`http://localhost:3000`) para consultar el menú en tiempo real y enviarlo a WhatsApp.

---

## 1. Crear la Action en Botpress Studio

1. Abre tu navegador e ingresa a [http://localhost:3000](http://localhost:3000).
2. Inicia sesión en Botpress y entra en tu bot (por ejemplo, `koval-bot` o `RestauranteBot`).
3. En la barra lateral izquierda, haz clic en el icono **Code Editor** / **Actions** (icono de corchetes `{ }` o rayo `⚡`).
4. Haz clic en el botón **`+` (New Action)** o **Create Action**.
5. Nombra el archivo como: `get_live_menu.js`.
6. Pega el contenido del archivo [`botpress/actions/get_live_menu.js`](./actions/get_live_menu.js).
7. Haz clic en **Save** / **Guardar**.

---

## 2. Usar la Action en el Flujo Conversacional (Flow Editor)

1. En el menú lateral izquierdo, dirígete a **Flows** (Editor de Flujos).
2. Selecciona o crea el nodo donde el usuario solicita ver el menú (ej. tras decir *"quiero ver el menú"*, *"carta"* o al inicio de la conversación).
3. En las acciones del nodo (**On Enter** o **Execute Code**):
   - Haz clic en **Add Action** (+).
   - Selecciona **Execute Code** / **Action**.
   - Busca y elige **`Consultar Menú en Vivo`** (`get_live_menu`).
   - (Opcional) Si deseas consultar un restaurante diferente, puedes pasar el parámetro `slug`: `"pizzeria-napoles"`.
4. En el mismo nodo o en un nodo siguiente, agrega un mensaje de texto para responder al usuario:
   - Haz clic en **Add Message** / **Text**.
   - Escribe en el campo de texto:
     ```text
     {{temp.formattedMenu}}
     ```
5. Guarda el flujo y pruébalo en el **Chat Emulator** de Botpress.

---

## 3. Variables Disponibles tras la Ejecución

| Variable | Tipo | Descripción |
| :--- | :--- | :--- |
| `temp.formattedMenu` | `String` | Texto preformateado con emojis y formato Markdown listo para WhatsApp. |
| `temp.menuData` | `Object` | Objeto JSON completo con los datos crudos del restaurante, categorías y platos. |
