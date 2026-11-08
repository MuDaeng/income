import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Security } from '@app/common';
import { TossModule } from '../toss/toss.module.js';
import { SecurityController } from './security.controller.js';
import { SecurityService } from './security.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Security]), TossModule],
  controllers: [SecurityController],
  providers: [SecurityService],
})
export class SecurityModule {}
