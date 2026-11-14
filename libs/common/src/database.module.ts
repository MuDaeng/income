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
                // DB 서버 time_zone(+09:00)과 맞춤: mysql2가 TIMESTAMP/DATETIME 값을 Node 서버 시간대(EC2는 UTC)가 아닌 KST로 해석·전송
                timezone: '+09:00',
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
