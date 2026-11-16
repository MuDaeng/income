import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientToken } from '../../client/client-token.entity.js';
import { kisConfig } from '../../config/kis.config.js';
import { KisClient } from './kis.client.js';

@Module({
  imports: [
    ConfigModule.forFeature(kisConfig),
    TypeOrmModule.forFeature([ClientToken]),
  ],
  providers: [KisClient],
  exports: [KisClient],
})
export class KisModule {}
