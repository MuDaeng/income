import {registerAs} from "@nestjs/config";

export const authConfig = registerAs('auth', () => ({
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    /** API의 외부 공개 주소(API_URL, 예: https://api.mudaeng.online) + 경로(GOOGLE_CALLBACK_URI, 예: /auth/google/callback) */
    googleCallbackUrl: `${process.env.API_URL}${process.env.GOOGLE_CALLBACK_URI}`,
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    /** 초 단위 (기본 15분) */
    jwtAccessExpiresIn: parseInt(process.env.JWT_ACCESS_EXPIRES_IN ?? '900', 10),
    /** 초 단위 (기본 14일) */
    jwtRefreshExpiresIn: parseInt(process.env.JWT_REFRESH_EXPIRES_IN ?? '1209600', 10),
    /** 로그인 후 redirect할 프론트엔드 origin (예: https://www.mudaeng.online) */
    frontendUrl: process.env.FRONTEND_URL1,
}));
