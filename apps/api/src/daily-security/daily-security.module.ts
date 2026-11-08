import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailySecurity, Security } from '@app/common';
import { DataGoKrModule } from '../data-go-kr/data-go-kr.module.js';
import { DailySecurityController } from './daily-security.controller.js';
import { DailySecurityService } from './daily-security.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([DailySecurity, Security]), DataGoKrModule],
  controllers: [DailySecurityController],
  providers: [DailySecurityService],
})
export class DailySecurityModule {}
