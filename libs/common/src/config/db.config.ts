import { registerAs } from '@nestjs/config';
import awsCaBundle from 'aws-ssl-profiles';

export const dbConfig = registerAs('db', () => ({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '3306', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // DB_SSL=true: SSL로 접속하고 서버 인증서를 AWS RDS CA 번들로 검증한다.
    // Lightsail 관리형 DB·RDS는 require_secure_transport=ON이라 SSL이 없으면 접속이 거부된다. 로컬 MySQL은 비워 둔다
    ...(process.env.DB_SSL === 'true' ? { ssl: awsCaBundle } : {}),
}));
