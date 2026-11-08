import {registerAs} from "@nestjs/config";

/** Massive(구 Polygon) REST API (https://massive.com/docs) */
export const massiveConfig = registerAs('massive', () => ({
    apiKey: process.env.MASSIVE_API_KEY,
    baseUrl: 'https://api.massive.com',
}));
