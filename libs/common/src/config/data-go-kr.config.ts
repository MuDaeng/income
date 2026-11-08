import {registerAs} from "@nestjs/config";

/** 공공데이터포털(data.go.kr) Open API. serviceKey는 포털에서 받은 일반 인증키(Decoding) */
export const dataGoKrConfig = registerAs('dataGoKr', () => ({
    serviceKey: process.env.DATA_GO_KR_SERVICE_KEY,
    baseUrl: 'https://apis.data.go.kr',
}));
