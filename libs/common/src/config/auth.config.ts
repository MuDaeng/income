import {registerAs} from "@nestjs/config";

export const authConfig = registerAs('auth', () => ({
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleCallbackUrl: process.env.GOOGLE_CALLBACK_URI,
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    /** 초 단위 (기본 15분) */
    jwtAccessExpiresIn: parseInt(process.env.JWT_ACCESS_EXPIRES_IN ?? '900', 10),
    /** 초 단위 (기본 14일) */
    jwtRefreshExpiresIn: parseInt(process.env.JWT_REFRESH_EXPIRES_IN ?? '1209600', 10),
    /** 프론트엔드 origin (예: http://localhost:3000) */
    frontendUrl: process.env.FRONTEND_URL,
}));
