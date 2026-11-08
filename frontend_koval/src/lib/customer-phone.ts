/**
 * Contacto de WhatsApp Web que llegó con LID (identificador anónimo) y sin número real: el backend
 * lo guarda como "lid:<id>". Sus dígitos NO son un teléfono (salían como +238..., +276...).
 */
export const isLidContact = (phone: string | null | undefined) => Boolean(phone?.startsWith('lid:'));

/** "573001234567" -> "+57 300 123 4567" (números colombianos); otros: "+<dígitos>"; LID: sin número */
export function formatCustomerPhone(phone: string): string {
  if (isLidContact(phone)) return 'WhatsApp · número privado';
  const co = /^57(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return co ? `+57 ${co[1]} ${co[2]} ${co[3]}` : `+${phone}`;
}

/** Dígitos para wa.me, o null si el contacto no tiene número visible */
export const waPhone = (phone: string | null | undefined) =>
  phone && !isLidContact(phone) ? phone.replace(/\D/g, '') || null : null;
