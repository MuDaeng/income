import {registerAs} from "@nestjs/config";

/** 한국투자증권(KIS) Open API. appKey·appSecret은 KIS Developers에서 발급 */
export const kisConfig = registerAs('kis', () => ({
    appKey: process.env.KIS_CLIENT_ID,
    appSecret: process.env.KIS_CLIENT_SECRET,
    baseUrl: 'https://openapi.koreainvestment.com:9443',
}));
