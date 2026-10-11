import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  // rawBody: conserva los bytes originales del cuerpo (req.rawBody) para verificar
  // la firma HMAC de los webhooks de Meta (x-hub-signature-256).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Detrás de nginx: confiar en 1 proxy para que req.ip sea la IP real del cliente
  // (X-Forwarded-For). Imprescindible para el rate limiting por IP.
  app.set('trust proxy', 1);

  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 Backend corriendo en: http://localhost:${port}`);
}
bootstrap();