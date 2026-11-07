import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule, Oauth, User } from '@app/common';
import { ApiController } from './api.controller.js';
import { ApiService } from './api.service.js';

@Module({
  imports: [DatabaseModule, TypeOrmModule.forFeature([User, Oauth])],
  controllers: [ApiController],
  providers: [ApiService],
})
export class ApiModule {}
