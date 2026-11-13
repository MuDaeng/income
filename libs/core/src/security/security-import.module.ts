import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Security } from '@app/common';
import { TossModule } from '../clients/toss/toss.module.js';
import { SecurityImportService } from './security-import.service.js';

/** Toss 종목 가져오기 (api 수동 가져오기·batch 일배치 공용) */
@Module({
  imports: [TypeOrmModule.forFeature([Security]), TossModule],
  providers: [SecurityImportService],
  exports: [SecurityImportService],
})
export class SecurityImportModule {}
