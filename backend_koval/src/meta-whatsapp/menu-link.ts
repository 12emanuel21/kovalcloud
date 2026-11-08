/**
 * Carta web en vivo (/menu/<slug>): la respuesta por defecto cuando el cliente pide el menú.
 * A diferencia del PDF importado, muestra fotos, disponibilidad real y deja armar el pedido.
 * La página pública se busca por slug: un enlace con el id del restaurante da 404.
 */
export function menuWebUrl(restaurant: { slug: string }): string {
  const base = (process.env.FRONTEND_URL || 'https://kovalcloud.com').replace(/\/+$/, '');
  return `${base}/menu/${encodeURIComponent(restaurant.slug)}`;
}

/** Respuesta rápida sin texto propio (WEB_LINK, o PDF_DOCUMENT sin archivo válido) */
export const menuLinkReply = (url: string) =>
  `Aquí tienes nuestra carta en vivo, con fotos y disponibilidad en tiempo real. Desde ahí puedes armar tu pedido: ${url}`;

/** Agrega el enlace de la carta a la respuesta de la IA (sin repetirlo si ya lo escribió) */
export function withMenuLink(response: string, url: string): string {
  if (response.includes(url)) return response;
  return `${response.trim()}\n\n📲 Carta en vivo: ${url}`.trim();
}

/** URL http(s) válida configurada en una respuesta rápida PDF_DOCUMENT */
export function isHttpUrl(value: string | null | undefined): value is string {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
