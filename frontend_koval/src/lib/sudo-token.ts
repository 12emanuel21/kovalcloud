/**
 * Sudo token (Sudo Mode, 30 min) en sessionStorage: sobrevive a recargas pero muere al cerrar
 * la pestaña. Se ata al usuario para que otra sesión en el mismo navegador no lo reutilice.
 */
const SUDO_KEY = 'koval_sudo';
export const SUDO_HEADER = 'x-sudo-token';

interface StoredSudo {
  token: string;
  expiresAt: string;
  userId: string;
}

export function readSudoToken(userId: string | undefined): string | null {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(SUDO_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<StoredSudo>) : null;
    if (!value?.token || value.userId !== userId) return null;
    // Margen de 15 s para no enviar un token que vence en tránsito
    if (!value.expiresAt || new Date(value.expiresAt).getTime() - 15_000 < Date.now()) return null;
    return value.token;
  } catch {
    return null;
  }
}

export function saveSudoToken(token: string, expiresAt: string, userId: string) {
  try {
    sessionStorage.setItem(SUDO_KEY, JSON.stringify({ token, expiresAt, userId } satisfies StoredSudo));
  } catch {
    // Sin sessionStorage el Sudo Mode dura solo esta petición
  }
}

export function clearSudoToken() {
  try {
    sessionStorage.removeItem(SUDO_KEY);
  } catch {
    // nada que limpiar
  }
}
