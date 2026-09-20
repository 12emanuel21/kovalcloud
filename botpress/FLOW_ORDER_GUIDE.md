# Guía de Flujo Conversacional de Pedidos en Botpress v12

Esta guía detalla cómo estructurar los nodos en el **Editor de Flujos (Flows)** de Botpress Studio ([http://localhost:3000](http://localhost:3000)) para capturar datos de un pedido conversacionalmente, registrarlo en NestJS mediante la Action `create_live_order.js` y devolver la confirmación al cliente.

---

## 1. Registrar la Action en Botpress

1. En Botpress Studio, ve a la sección **Code Editor** / **Actions** (`{ }` en la barra lateral izquierda).
2. Haz clic en **`+` (New Action)**.
3. Asigna el nombre: `create_live_order.js`.
4. Pega el contenido del archivo [`botpress/actions/create_live_order.js`](./actions/create_live_order.js).
5. Guarda los cambios.

---

## 2. Diagrama del Flujo Conversacional

```mermaid
graph TD
    A[Inicio / Consulta Menú] --> B[Nodo 1: Seleccionar Plato]
    B --> C[Nodo 2: Solicitar Nombre]
    C --> D[Nodo 3: Solicitar Dirección]
    D --> E[Nodo 4: Ejecutar Action create_live_order]
    E --> F[Nodo 5: Enviar Confirmación {{temp.orderConfirmation}}]
```

---

## 3. Configuración Nodo por Nodo

### **Nodo 1: Selección del Plato (`select_item`)**
- **Propósito:** Mostrar las opciones o solicitar qué plato desea pedir.
- **Acciones / Mensajes:**
  - Si previamente se ejecutó `get_live_menu`, el cliente ya vio la carta.
  - Agregar un elemento **Single Choice** o **Input de Texto**:
    - Pregunta: *"¿Qué plato deseas ordenar hoy? Escribe el nombre o selecciona una opción."*
  - Extraer y guardar la respuesta en `temp.selectedItemId` o `temp.menuItemId`.

---

### **Nodo 2: Solicitar Nombre del Cliente (`ask_name`)**
- **Propósito:** Capturar el nombre para el registro de la orden.
- **Acciones / Mensajes:**
  - Agregar **Input de Texto**:
    - Pregunta: *"¡Excelente elección! 🍕 ¿A nombre de quién registramos el pedido?"*
  - En la pestaña de captura del input:
    - Guardar en la variable: `temp.customerName` (o `session.customerName`).

---

### **Nodo 3: Solicitar Dirección de Entrega (`ask_address`)**
- **Propósito:** Capturar la dirección física para el delivery.
- **Acciones / Mensajes:**
  - Agregar **Input de Texto**:
    - Pregunta: *"Por favor indícanos tu dirección de entrega completa (ej. Cra 45 # 26-85 Apto 401):"*
  - En la pestaña de captura del input:
    - Guardar en la variable: `temp.deliveryAddress`.

---

### **Nodo 4: Ejecución y Confirmación del Pedido (`process_order`)**
- **Propósito:** Llamar a la API de NestJS y responder con el recibo.
- **En la sección On Enter (Execute Code):**
  1. Haz clic en **Add Action** (+).
  2. Selecciona **Execute Code / Action**.
  3. Elige **`Crear Pedido en Vivo`** (`create_live_order`).
  4. Los parámetros tomarán automáticamente los valores almacenados en `temp.customerName`, `temp.deliveryAddress` y `temp.menuItemId`.
- **En la sección de Mensajes (Send Message):**
  1. Haz clic en **Add Message** > **Text**.
  2. Escribe:
     ```text
     {{temp.orderConfirmation}}
     ```

---

## 4. Variables Generadas y Disponibles

| Variable | Tipo | Descripción |
| :--- | :--- | :--- |
| `temp.orderResult` | `Object` | Objeto JSON retornado por `POST /orders` con el `id`, `total`, `status` y detalle. |
| `temp.orderConfirmation` | `String` | Mensaje listo con formato Markdown y emojis para WhatsApp confirmando la orden y número de ticket. |

---

## 5. Visualización en el Dashboard Administrativo

Una vez ejecutada la Action desde la conversación de Botpress:
1. El pedido aparecerá **instantáneamente** en la sección **Live Orders** del Dashboard:
   - [http://localhost:3030/dashboard/orders](http://localhost:3030/dashboard/orders)
2. El estado inicial será `PENDING` (Pendiente - Amarillo).
3. El administrador podrá cambiarlo a `PREPARING` (En Preparación) o `DELIVERED` (Entregado).
