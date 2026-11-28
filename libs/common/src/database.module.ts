import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, type DataSourceOptions } from 'typeorm';
import {
    addTransactionalDataSource,
    deleteDataSourceByName,
} from 'typeorm-transactional';
import { dbConfig } from './config/db.config.js';

/**
 * @Transactional()이 쓸 DataSource를 등록한다.
 * 연결에 실패하면 @nestjs/typeorm이 factory를 다시 불러 새 DataSource를 만드는데, 이전 시도의 등록이 남아 있으면
 * addTransactionalDataSource가 "already added"로 throw해 실제 연결 오류(Access denied, SSL 거부 등)를 가리고
 * 재시도도 계속 실패한다. 연결에 실패한 이전 DataSource는 쓰이지 않으므로 지우고 새것으로 바꾼다
 */
export const registerTransactionalDataSource = (
    options: DataSourceOptions,
): DataSource => {
    deleteDataSourceByName('default');
    return addTransactionalDataSource(new DataSource(options));
};

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
            // @Transactional()이 이 DataSource를 쓰도록 등록 (연결 재시도 때마다 새로 등록)
            dataSourceFactory: async (options) =>
                registerTransactionalDataSource(options!),
        }),
    ],
})
export class DatabaseModule {}
