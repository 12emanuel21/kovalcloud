import { Module } from '@nestjs/common';
import { MetaWhatsAppController } from './meta-whatsapp.controller';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MetaWhatsAppController],
  providers: [MetaWhatsAppService],
  exports: [MetaWhatsAppService],
})
export class MetaWhatsAppModule {}
