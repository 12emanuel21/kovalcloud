/**
 * Consulta el menú en vivo del restaurante en la API de NestJS y lo formatea para WhatsApp.
 * @title Consultar Menú en Vivo
 * @category KovalCloud
 * @author KovalCloud Team
 * @param {string} [slug=pizzeria-napoles] El slug del restaurante en Koval Cloud
 * @param {string} [apiUrl=http://host.docker.internal:4000] URL base de la API de NestJS
 */
const axios = require('axios')

const getLiveMenu = async (slug = 'pizzeria-napoles', apiUrl = 'http://host.docker.internal:4000') => {
  try {
    const targetSlug = slug || 'pizzeria-napoles'
    const base = apiUrl || 'http://host.docker.internal:4000'

    let res
    try {
      res = await axios.get(`${base}/restaurants/slug/${targetSlug}`, { timeout: 6000 })
    } catch (err) {
      // Fallback a localhost si host.docker.internal no resuelve o se ejecuta en local
      if (base.includes('host.docker.internal')) {
        res = await axios.get(`http://localhost:4000/restaurants/slug/${targetSlug}`, { timeout: 6000 })
      } else {
        throw err
      }
    }

    const restaurant = res.data

    if (!restaurant) {
      temp.formattedMenu = '⚠️ Lo sentimos, no encontramos el menú de este restaurante en este momento.'
      temp.menuData = null
      return
    }

    // 1. Guardar objeto crudo para uso del bot
    temp.menuData = restaurant

    // 2. Formatear mensaje legible para WhatsApp
    let msg = `🍕 *${restaurant.name} - Menú del Día* 🍕\n\n`

    if (!restaurant.categories || restaurant.categories.length === 0) {
      msg += `_Actualmente no hay categorías ni platos publicados._\n\n`
    } else {
      restaurant.categories.forEach((category) => {
        const availableItems = (category.items || []).filter((item) => item.isAvailable !== false)

        if (availableItems.length > 0) {
          msg += `*${category.name}*\n`
          availableItems.forEach((item) => {
            const formattedPrice = item.price
              ? `$${Number(item.price).toLocaleString('es-CO')} COP`
              : ''
            msg += `• *${item.name}* - ${formattedPrice}\n`
            if (item.description) {
              msg += `  _${item.description.trim()}_\n`
            }
          })
          msg += `\n`
        }
      })
    }

    const webMenuUrl = `http://localhost:3030/menu/${targetSlug}`
    msg += `👉 Puedes hacer tu pedido directamente aquí o en nuestra web:\n${webMenuUrl}`

    // 3. Guardar en variable temporal de Botpress
    temp.formattedMenu = msg
  } catch (error) {
    bp.logger.error('Error al consultar el menú en vivo:', error.message || error)
    temp.formattedMenu = `⚠️ No pudimos cargar el menú en este momento. Por favor visita nuestra web: http://localhost:3030/menu/${slug || 'pizzeria-napoles'}`
    temp.menuData = null
  }
}

return getLiveMenu(args.slug, args.apiUrl)
