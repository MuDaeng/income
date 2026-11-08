import {registerAs} from "@nestjs/config";

/** Toss Open API (https://openapi.tossinvest.com). 호출하는 PC의 IP가 Toss 허용 IP에 등록돼 있어야 함 */
export const tossConfig = registerAs('toss', () => ({
    clientId: process.env.TOSS_CLIENT_ID,
    clientSecret: process.env.TOSS_CLIENT_SECRET,
    baseUrl: 'https://openapi.tossinvest.com',
}));
