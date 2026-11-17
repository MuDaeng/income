import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatchHistory } from '@app/common';
import { AdminController } from './restapi/admin.controller.js';
import { AdminGuard } from './restapi/admin.guard.js';
import { AdminService } from './restapi/admin.service.js';

/**
 * 관리자 전용 API (access token의 rules에 admin이 있어야 함, AdminGuard).
 * 엔티티 도메인별 폴더 규칙의 예외: 여러 도메인의 관리 기능을 모은다.
 * 배치 실행 이력 조회
 */
@Module({
  imports: [TypeOrmModule.forFeature([BatchHistory])],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
