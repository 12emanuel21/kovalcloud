import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import type { WompiEvent } from './wompi';

/**
 * Webhooks públicos de pasarelas de pago. Sin JWT: la autenticidad se verifica con la
 * firma del evento (ver PaymentsService.handleWompiEvent).
 * URL para configurar en Wompi: https://<dominio>/api/webhooks/wompi (nginx quita /api).
 */
@Controller('webhooks')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('wompi')
  @HttpCode(HttpStatus.OK)
  handleWompi(@Body() event: WompiEvent) {
    return this.paymentsService.handleWompiEvent(event);
  }
}
