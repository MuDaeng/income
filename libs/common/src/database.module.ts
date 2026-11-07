import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dbConfig } from './config/db.config.js';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [dbConfig] }),
        TypeOrmModule.forRootAsync({
            inject: [dbConfig.KEY],
            useFactory: (db: ConfigType<typeof dbConfig>) => ({
                type: 'mysql',
                ...db,
                synchronize: true,
                autoLoadEntities: true,
            }),
        }),
    ],
})
export class DatabaseModule {}
