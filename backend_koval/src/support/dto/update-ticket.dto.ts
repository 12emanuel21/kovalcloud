import { IsIn, IsOptional } from 'class-validator';
import { TICKET_PRIORITIES, TICKET_STATUSES, type TicketPriority, type TicketStatus } from '../ticket-constants';

/** Cambio de estado y/o prioridad de un ticket */
export class UpdateTicketDto {
  @IsOptional()
  @IsIn(TICKET_STATUSES, { message: `El estado debe ser uno de: ${TICKET_STATUSES.join(', ')}` })
  status?: TicketStatus;

  @IsOptional()
  @IsIn(TICKET_PRIORITIES, { message: `La prioridad debe ser una de: ${TICKET_PRIORITIES.join(', ')}` })
  priority?: TicketPriority;
}
