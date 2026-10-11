const fs = require('fs');

const ctrlPath = '/home/evargas/dev/kovalcloud/backend_koval/src/meta-whatsapp/meta-whatsapp.controller.ts';
let ctrl = fs.readFileSync(ctrlPath, 'utf8');

if (!ctrl.includes('Headers')) {
    ctrl = ctrl.replace('@nestjs/common\';', ', Headers } from \'@nestjs/common\';');
}

ctrl = ctrl.replace(/async handleWebhook\(\@Body\(\) body: any\) \{[\s\S]*?this\.logger\.log\('recibido un evento de whatsapp'\);[\s\S]*?this\.whatsappService\.processWebhook\(body\);[\s\S]*?return 'EVENT_RECEIVED';[\s\S]*?\}/, 
sync handleWebhook(@Body() body: any, @Headers('x-source') source: string) {
    this.logger.log('recibido un evento de whatsapp');
    const isBaileys = source === 'baileys';
    // Envía al worker processWebhook y retorna rápido el 200 OK
    this.whatsappService.processWebhook(body, isBaileys);
    return 'EVENT_RECEIVED';
  });

fs.writeFileSync(ctrlPath, ctrl);

const svcPath = '/home/evargas/dev/kovalcloud/backend_koval/src/meta-whatsapp/meta-whatsapp.service.ts';
let svc = fs.readFileSync(svcPath, 'utf8');
svc = svc.replace('async processWebhook(body: any) {', 'async processWebhook(body: any, isBaileys: boolean = false) {');
fs.writeFileSync(svcPath, svc);