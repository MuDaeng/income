import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientToken, kisConfig } from '@app/common';
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
