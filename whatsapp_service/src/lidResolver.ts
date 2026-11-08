import fs from 'fs';
import path from 'path';
import type { WAMessageKey } from '@whiskeysockets/baileys';

/**
 * WhatsApp identifica a muchos contactos por un LID (<id>@lid, identificador anónimo) en vez de
 * por su número (<número>@s.whatsapp.net). Los dígitos de un LID NO son un teléfono: tratados
 * como tal salían números falsos (+238..., +276...) en el Inbox y en los pedidos.
 *
 * Aquí se resuelve el número real cuando WhatsApp lo comparte y, si no, el contacto viaja al
 * backend como "lid:<id>" (nunca como dígitos sueltos) para que no se confunda con un teléfono.
 */

export const LID_PREFIX = 'lid:';
const PN_SUFFIX = '@s.whatsapp.net';
const LID_SUFFIX = '@lid';
const STORE_FILE = 'koval-lid-map.json';

/** Campos de la clave que traen el número real según la versión de Baileys (6.7: *Pn; 7: *Alt) */
export type IncomingKey = WAMessageKey & { remoteJidAlt?: string | null; participantAlt?: string | null };

/** "573001234567:12@s.whatsapp.net" -> "573001234567" */
export const jidUser = (jid: string) => jid.split('@')[0].split(':')[0];
export const isLidJid = (jid: string | null | undefined): jid is string => Boolean(jid?.endsWith(LID_SUFFIX));
const isPnJid = (jid: string | null | undefined): jid is string => Boolean(jid?.endsWith(PN_SUFFIX));

/**
 * Mapa LID -> número de una sesión, y JID con el que responder a cada contacto.
 * Se guarda junto a las credenciales (se borra con ellas al desvincular) para seguir
 * respondiendo bien a los LID tras un reinicio.
 */
export class LidStore {
  /** dígitos del LID -> dígitos del número real */
  private readonly lidToPn = new Map<string, string>();
  /** identificador que conoce el backend (número o dígitos del LID) -> JID del chat */
  private readonly replyJids = new Map<string, string>();

  constructor(private readonly folder: string) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(folder, STORE_FILE), 'utf8'));
      for (const [lid, pn] of Object.entries(raw.lidToPn ?? {})) this.lidToPn.set(lid, String(pn));
      for (const [id, jid] of Object.entries(raw.replyJids ?? {})) this.replyJids.set(id, String(jid));
    } catch {
      // Sin archivo todavía (sesión nueva) o ilegible: se reconstruye con los próximos mensajes
    }
  }

  phoneForLid(lidJid: string): string | null {
    return this.lidToPn.get(jidUser(lidJid)) ?? null;
  }

  /** Aprende un par LID <-> número (contactos, phoneNumberShare o la clave de un mensaje) */
  learn(lidJid: string | null | undefined, pnJid: string | null | undefined): void {
    if (!isLidJid(lidJid) || !isPnJid(pnJid)) return;
    const lid = jidUser(lidJid);
    const pn = jidUser(pnJid);
    if (this.lidToPn.get(lid) === pn) return;
    this.lidToPn.set(lid, pn);
    // El chat sigue siendo el LID: las respuestas al número real van a ese mismo chat
    if (!this.replyJids.has(pn)) this.replyJids.set(pn, lidJid);
    this.save();
  }

  /** Recuerda a qué JID responder cuando el backend escriba a `id` */
  rememberReplyJid(id: string, jid: string): void {
    if (this.replyJids.get(id) === jid) return;
    this.replyJids.set(id, jid);
    // Solo vale la pena persistir los que no se deducen de los dígitos (LID)
    if (isLidJid(jid)) this.save();
  }

  /** JID destino para un identificador del backend ("573001234567", "lid:2381..." o sus dígitos) */
  replyJidFor(target: string): string {
    const isLid = target.startsWith(LID_PREFIX);
    const digits = target.replace(/\D/g, '');
    return this.replyJids.get(digits) ?? `${digits}${isLid ? LID_SUFFIX : PN_SUFFIX}`;
  }

  private save(): void {
    try {
      fs.mkdirSync(this.folder, { recursive: true });
      fs.writeFileSync(
        path.join(this.folder, STORE_FILE),
        JSON.stringify({
          lidToPn: Object.fromEntries(this.lidToPn),
          replyJids: Object.fromEntries([...this.replyJids].filter(([, jid]) => isLidJid(jid))),
        }),
      );
    } catch (e) {
      console.warn(`⚠️ No se pudo guardar el mapa de LIDs en ${this.folder}:`, e);
    }
  }
}

/**
 * Número real del remitente: el JID si ya es de número; si es un LID, los campos alternos de la
 * clave (remoteJidAlt, senderPn, participantPn, participant) o lo aprendido de los contactos.
 */
export function resolveSenderPhone(key: IncomingKey, store: LidStore): string | null {
  const remoteJid = key.remoteJid ?? '';
  if (isPnJid(remoteJid)) return jidUser(remoteJid);
  if (!isLidJid(remoteJid)) return null;
  const alt = [key.remoteJidAlt, key.senderPn, key.participantAlt, key.participantPn, key.participant].find(isPnJid);
  if (alt) {
    store.learn(remoteJid, alt);
    return jidUser(alt);
  }
  return store.phoneForLid(remoteJid);
}

/**
 * Identificador del cliente para el backend: su número, o "lid:<id>" cuando WhatsApp no lo comparte.
 * También deja anotado a qué chat responder.
 */
export function senderIdFor(key: IncomingKey, store: LidStore): string {
  const remoteJid = key.remoteJid ?? '';
  const phone = resolveSenderPhone(key, store);
  if (phone) {
    store.rememberReplyJid(phone, remoteJid);
    return phone;
  }
  const user = jidUser(remoteJid);
  store.rememberReplyJid(user, remoteJid);
  return isLidJid(remoteJid) ? `${LID_PREFIX}${user}` : user;
}
