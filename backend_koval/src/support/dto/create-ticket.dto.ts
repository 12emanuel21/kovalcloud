import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { TICKET_PRIORITIES, type TicketPriority } from '../ticket-constants';

/** Nuevo ticket de soporte: siempre nace OPEN (el status del cliente no se acepta) */
export class CreateTicketDto {
  @IsString()
  @IsNotEmpty({ message: 'El asunto es obligatorio' })
  @MaxLength(150, { message: 'El asunto no puede superar los 150 caracteres' })
  subject: string;

  @IsString()
  @IsNotEmpty({ message: 'La descripción es obligatoria' })
  @MaxLength(5000, { message: 'La descripción no puede superar los 5000 caracteres' })
  description: string;

  @IsOptional()
  @IsIn(TICKET_PRIORITIES, { message: `La prioridad debe ser una de: ${TICKET_PRIORITIES.join(', ')}` })
  priority?: TicketPriority;
}
