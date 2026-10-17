import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  listTickets(restaurantId: string) {
    return this.prisma.supportTicket.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createTicket(restaurantId: string, dto: CreateTicketDto) {
    return this.prisma.supportTicket.create({
      data: {
        restaurantId,
        subject: dto.subject.trim(),
        description: dto.description.trim(),
        priority: dto.priority ?? 'NORMAL',
        status: 'OPEN',
      },
    });
  }

  async updateTicket(restaurantId: string, ticketId: string, dto: UpdateTicketDto) {
    if (dto.status === undefined && dto.priority === undefined) {
      throw new BadRequestException('Indica el nuevo status o priority del ticket');
    }
    // El ticket debe ser de este restaurante: un id de otro local responde 404, no 403
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, restaurantId },
      select: { id: true },
    });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: dto.status, priority: dto.priority },
    });
  }
}
