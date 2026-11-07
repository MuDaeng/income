import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { initializeTransactionalContext } from 'typeorm-transactional';
import { ApiModule } from './api.module.js';

async function bootstrap() {
  // @Transactional()을 쓰려면 앱 생성 전에 호출해야 함
  initializeTransactionalContext();
  const app = await NestFactory.create(ApiModule);
  // /auth/access에서 refresh token cookie를 읽기 위함
  app.use(cookieParser());
  // 프론트엔드에서 cookie를 담아(credentials: 'include') 호출할 수 있도록 허용
  app.enableCors({ origin: process.env.FRONTEND_URL, credentials: true });
  const options = new DocumentBuilder()
      .setTitle('Income API')
      .setDescription('배당인컴')
      .setVersion('1.0')
      .addServer('http://localhost:3000/', '스웨거 테스트')
      // .addServer('https://production.yourapi.com/', 'Production')
      .addTag('배당 인컴')
      .addBearerAuth()
      .addCookieAuth('refreshToken')
      .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api-docs', app, document);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
