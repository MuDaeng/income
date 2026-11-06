import { Module } from '@nestjs/common';
import { ApiController } from './api.controller.js';
import { ApiService } from './api.service.js';

@Module({
  imports: [],
  controllers: [ApiController],
  providers: [ApiService],
})
export class ApiModule {}
