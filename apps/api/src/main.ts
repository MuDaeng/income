import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { initializeTransactionalContext } from 'typeorm-transactional';
import { ApiModule } from './api.module.js';

async function bootstrap() {
  // @Transactional()을 쓰려면 앱 생성 전에 호출해야 함
  initializeTransactionalContext();
  const app = await NestFactory.create(ApiModule);
  const options = new DocumentBuilder()
      .setTitle('Income API')
      .setDescription('배당인컴')
      .setVersion('1.0')
      .addServer('http://localhost:3000/', '스웨거 테스트')
      // .addServer('https://production.yourapi.com/', 'Production')
      .addTag('배당 인컴')
      .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api-docs', app, document);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
