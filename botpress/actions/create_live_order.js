/**
 * Crea un pedido en tiempo real en la API de NestJS desde una conversación de Botpress.
 * @title Crear Pedido en Vivo
 * @category KovalCloud
 * @author KovalCloud Team
 * @param {string} [restaurantId] ID del restaurante (opcional si existe en temp.menuData)
 * @param {string} [customerName] Nombre del cliente
 * @param {string} [customerPhone] Teléfono o WhatsApp del cliente
 * @param {string} [deliveryAddress] Dirección de entrega del pedido
 * @param {string} [menuItemId] ID del plato o producto a ordenar
 * @param {number} [quantity=1] Cantidad de unidades a ordenar
 * @param {string} [notes] Notas o indicaciones adicionales para el restaurante
 * @param {string} [apiUrl=http://host.docker.internal:4000] URL base de la API de NestJS
 */
const axios = require('axios')

const createLiveOrder = async () => {
  try {
    const base = args.apiUrl || 'http://host.docker.internal:4000'

    // 1. Obtener restaurantId de los argumentos o del estado de la sesión
    let restId = args.restaurantId || (temp.menuData && temp.menuData.id) || (session.restaurantId) || '8a23ecc8-788f-43fd-a5d6-d3f83ab5316d'

    // 2. Extraer datos del cliente (soporte para variables de args, temp o event)
    const name = args.customerName || temp.customerName || (session.user && session.user.name) || 'Cliente WhatsApp'
    const phone = args.customerPhone || temp.customerPhone || (event.target || event.from) || '3001234567'
    const address = args.deliveryAddress || temp.deliveryAddress || 'Dirección no especificada'
    const orderNotes = args.notes || temp.orderNotes || 'Pedido generado desde WhatsApp Bot'
    const qty = Number(args.quantity || temp.quantity || 1) || 1

    // 3. Obtener menuItemId
    let targetItemId = args.menuItemId || temp.menuItemId || temp.selectedItemId

    // Si no se proporcionó menuItemId explícito, intentar usar el primer item disponible del menú en memoria
    let itemName = 'Producto'
    let unitPrice = undefined

    if (temp.menuData && temp.menuData.categories) {
      for (const cat of temp.menuData.categories) {
        if (cat.items && cat.items.length > 0) {
          if (!targetItemId) {
            targetItemId = cat.items[0].id
            itemName = cat.items[0].name
            unitPrice = cat.items[0].price
            break
          } else {
            const found = cat.items.find((i) => i.id === targetItemId)
            if (found) {
              itemName = found.name
              unitPrice = found.price
              break
            }
          }
        }
      }
    }

    if (!targetItemId) {
      temp.orderConfirmation = '⚠️ No pudimos identificar el plato a ordenar. Por favor selecciona una opción válida del menú.'
      temp.orderResult = null
      return
    }

    // 4. Construir payload para la API de NestJS
    const payload = {
      restaurantId: restId,
      customerName: name,
      customerPhone: phone,
      deliveryAddress: address,
      notes: orderNotes,
      items: [
        {
          menuItemId: targetItemId,
          quantity: qty,
          ...(unitPrice !== undefined ? { unitPrice } : {}),
        },
      ],
    }

    // 5. Enviar petición HTTP POST a NestJS
    let res
    try {
      res = await axios.post(`${base}/orders`, payload, { timeout: 7000 })
    } catch (err) {
      // Fallback a localhost si host.docker.internal falla o se ejecuta en local
      if (base.includes('host.docker.internal')) {
        res = await axios.post(`http://localhost:4000/orders`, payload, { timeout: 7000 })
      } else {
        throw err
      }
    }

    const order = res.data

    if (!order || !order.id) {
      throw new Error('La API no retornó un identificador de orden válido')
    }

    // 6. Guardar resultado crudo en variables temporales
    temp.orderResult = order

    const shortId = order.id.slice(0, 8).toUpperCase()
    const totalFormatted = order.total ? `$${Number(order.total).toLocaleString('es-CO')} COP` : ''

    // 7. Construir mensaje preformateado para WhatsApp
    temp.orderConfirmation = `🎉 *¡Pedido Confirmado con Éxito!*
🧾 *Orden:* #${shortId}
🍕 *Item:* ${itemName} x${qty}
💰 *Total:* ${totalFormatted}
📍 *Entrega:* ${address}

Tu orden ya está en la cocina. Puedes consultar el estado en cualquier momento.`

  } catch (error) {
    bp.logger.error('Error al registrar la orden desde Botpress:', error.message || error)
    temp.orderConfirmation = '⚠️ Ocurrió un inconveniente al procesar tu pedido. Por favor intenta nuevamente o hazlo desde nuestro menú web: http://localhost:3030/menu/pizzeria-napoles'
    temp.orderResult = null
  }
}

return createLiveOrder()
