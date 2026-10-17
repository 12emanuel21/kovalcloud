import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

describe('SupportService', () => {
  let prisma: any;
  let service: SupportService;

  beforeEach(() => {
    prisma = {
      supportTicket: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 't-1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 't-1', ...data })),
      },
    };
    service = new SupportService(prisma);
  });

  it('lista los tickets del local del más reciente al más antiguo', async () => {
    await service.listTickets('rest-1');
    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith({
      where: { restaurantId: 'rest-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('crea el ticket siempre en OPEN y con prioridad NORMAL por defecto', async () => {
    await service.createTicket('rest-1', { subject: '  No llega el QR ', description: ' Detalle ' });
    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: { restaurantId: 'rest-1', subject: 'No llega el QR', description: 'Detalle', priority: 'NORMAL', status: 'OPEN' },
    });
  });

  it('no permite modificar un ticket de otro restaurante', async () => {
    prisma.supportTicket.findFirst.mockResolvedValue(null);
    await expect(service.updateTicket('rest-1', 't-otro', { status: 'RESOLVED' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.supportTicket.findFirst).toHaveBeenCalledWith({
      where: { id: 't-otro', restaurantId: 'rest-1' },
      select: { id: true },
    });
    expect(prisma.supportTicket.update).not.toHaveBeenCalled();
  });

  it('actualiza status o priority y rechaza un PATCH vacío', async () => {
    prisma.supportTicket.findFirst.mockResolvedValue({ id: 't-1' });
    await service.updateTicket('rest-1', 't-1', { status: 'IN_PROGRESS' });
    expect(prisma.supportTicket.update).toHaveBeenCalledWith({
      where: { id: 't-1' },
      data: { status: 'IN_PROGRESS', priority: undefined },
    });
    await expect(service.updateTicket('rest-1', 't-1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('los DTOs rechazan estados y prioridades fuera de la lista', async () => {
    const update = await validate(plainToInstance(UpdateTicketDto, { status: 'DONE', priority: 'MAX' }));
    expect(update.map((e) => e.property).sort()).toEqual(['priority', 'status']);
    const create = await validate(plainToInstance(CreateTicketDto, { subject: '', description: 'x', priority: 'URGENT' }));
    expect(create.map((e) => e.property)).toEqual(['subject']);
  });
});
