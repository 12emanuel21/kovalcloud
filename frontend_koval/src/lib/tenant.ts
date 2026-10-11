/**
 * Dominios raíz bajo los que un subdominio identifica a un restaurante:
 *   pizzeria-napoles.localhost      -> "pizzeria-napoles"
 *   pizzeria-napoles.kovalcloud.com -> "pizzeria-napoles"   (cuando se añada al env)
 *
 * Solo se reconocen estos dominios: hosts como "abc-xyz.trycloudflare.com" (túnel)
 * NO se tratan como restaurante y muestran el panel normal.
 * Configurable con TENANT_ROOT_DOMAINS="localhost,kovalcloud.com".
 */
export const TENANT_ROOT_DOMAINS = (process.env.TENANT_ROOT_DOMAINS || 'localhost')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

/** Subdominios que nunca son un restaurante */
const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'admin', 'api', 'dashboard']);

/** Formato válido de slug (mismo que el subdominio en el backend) */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Devuelve el slug del restaurante a partir del Host, o null si es el dominio
 * principal (panel de administración), un subdominio reservado o un host desconocido.
 */
export function getTenantSlugFromHost(hostHeader: string | null, rootDomains = TENANT_ROOT_DOMAINS): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.split(':')[0].toLowerCase(); // quitar puerto

  for (const root of rootDomains) {
    if (!host.endsWith(`.${root}`)) continue;
    const subdomain = host.slice(0, -(root.length + 1));
    // Solo un nivel: "a.b.localhost" no es un tenant válido
    if (subdomain.includes('.') || RESERVED_SUBDOMAINS.has(subdomain) || !SLUG_PATTERN.test(subdomain)) {
      return null;
    }
    return subdomain;
  }
  return null;
}
