import sys, re

file_path = '/home/evargas/dev/kovalcloud/backend_koval/src/meta-whatsapp/meta-whatsapp.service.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'const phoneNumberId = value.metadata?.phone_number_id;',
    'const phoneNumberId = value.metadata?.phone_number_id;\n      const displayPhoneNumber = value.metadata?.display_phone_number;\n      const isBaileys = displayPhoneNumber === \'BAILEYS_GATEWAY\';'
)

# 1st replacement: await this.sendTextMessage(targetPhoneId, targetToken, senderNumber, finalResponse);
content = re.sub(
    r'await this\.sendTextMessage\(\s*targetPhoneId,\s*targetToken,\s*senderNumber,\s*finalResponse\s*\);',
    r'await this.sendTextMessage(targetPhoneId, targetToken, senderNumber, finalResponse, isBaileys);',
    content
)

# 2nd replacement: multiline reset message
content = content.replace(
    'await this.sendTextMessage(\n          targetPhoneId,\n          targetToken,\n          senderNumber,\n          \'🧠 Memoria borrada. Contexto limpio. ¿En qué puedo ayudarte de nuevo?\',\n        );',
    'await this.sendTextMessage(\n          targetPhoneId,\n          targetToken,\n          senderNumber,\n          \'🧠 Memoria borrada. Contexto limpio. ¿En qué puedo ayudarte de nuevo?\',\n          isBaileys\n        );'
)

old_def = '''  async sendTextMessage(
    phoneNumberId: string,
    token: string,
    to: string,
    body: string,
  ): Promise<any> {'''
new_def = '''  async sendTextMessage(
    phoneNumberId: string,
    token: string,
    to: string,
    body: string,
    isBaileys: boolean = false,
  ): Promise<any> {'''
content = content.replace(old_def, new_def)

old_inner = '''    if (!phoneNumberId || !token) {
      this.logger.warn('⚠️ No se puede enviar mensaje: phoneNumberId o token no proporcionados.');
      return;
    }

    const cleanTo = to.replace(/\\D/g, '');
    const url = https://graph.facebook.com/v22.0//messages;

    this.logger.log(📤 [Meta v22.0] Enviando mensaje a []: " \);'''
new_inner
