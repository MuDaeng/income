import { NestFactory } from '@nestjs/core';
import { ApiModule } from './api.module.js';

async function bootstrap() {
  const app = await NestFactory.create(ApiModule);
  await app.listen(process.env.port ?? 3000);
}
await bootstrap();
