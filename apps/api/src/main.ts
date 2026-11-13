import { StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { initializeTransactionalContext } from 'typeorm-transactional';
import { ApiModule } from './api.module.js';

async function bootstrap() {
  // @Transactional()을 쓰려면 앱 생성 전에 호출해야 함
  initializeTransactionalContext();
  // app.set(...) 등 Express 전용 API를 쓰기 위해 NestExpressApplication으로 생성
  const app = await NestFactory.create<NestExpressApplication>(ApiModule);
  // Nginx 뒤에서 실제 클라이언트 IP 인식
  app.set('trust proxy', 1);
  // /auth/access에서 refresh token cookie를 읽기 위함
  app.use(cookieParser());
  // 프론트엔드에서 cookie를 담아(credentials: 'include') 호출할 수 있도록 허용 (www / non-www)
  const origins = [process.env.FRONTEND_URL1, process.env.FRONTEND_URL2].filter(
    (origin): origin is string => !!origin,
  );
  app.enableCors({ origin: origins, credentials: true });
  // @Body({ schema }) 등에 붙인 Zod 스키마로 입력 검증 (실패 시 400)
  app.useGlobalPipes(new StandardSchemaValidationPipe());

  // 운영에서는 API 구조가 공개되지 않도록 Swagger를 띄우지 않음
  if (process.env.NODE_ENV !== 'production') {
    const options = new DocumentBuilder()
      .setTitle('Income API')
      .setDescription('배당인컴')
      .setVersion('1.0')
      .addServer(`http://localhost:${process.env.PORT ?? 8080}/`, '스웨거 테스트')
      .addTag('배당 인컴')
      .addBearerAuth()
      .addCookieAuth('refreshToken')
      .build();
    const document = SwaggerModule.createDocument(app, options);
    SwaggerModule.setup('api-docs', app, document);
  }

  // 기본 127.0.0.1: 운영에서는 Nginx를 통해서만 접근 (운영 .env에 PORT=3000)
  await app.listen(process.env.PORT ?? 8080, process.env.HOST ?? '127.0.0.1');
}
await bootstrap();
