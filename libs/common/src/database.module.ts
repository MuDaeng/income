import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { addTransactionalDataSource } from 'typeorm-transactional';
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
            // @Transactional()이 이 DataSource를 쓰도록 등록
            dataSourceFactory: async (options) =>
                addTransactionalDataSource(new DataSource(options!)),
        }),
    ],
})
export class DatabaseModule {}
