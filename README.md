# income

국내(KOSPI·KOSDAQ)·미국(NYSE·NASDAQ·AMEX) 주식과 ETF의 매수·매도 내역을 기록하고, 보유 잔고의 평가금액·수익률과 배당금을 원화 기준으로 보여주는 자산 관리 서비스의 백엔드입니다.

- API: `https://api.mudaeng.online`
- 프론트엔드: `https://www.mudaeng.online`

## 주요 기능

- **Google 로그인**: Google OAuth 후 JWT 액세스 토큰과 httpOnly 쿠키의 리프레시 토큰(재발급 시 교체)으로 인증
- **종목 검색**: 종목코드(심볼) 또는 종목명으로 검색하고, 종목별 일별 시세 조회
- **잔고 관리**: 매수 등록, 매도 처리, 잘못 등록한 매수분 삭제, 매수 내역 조회
- **통합잔고**: 종목별 매입평균가·평가금액·수익률과 한국/미국/전체 합계 (USD는 최신 환율로 원화 환산)
- **배당금 내역**: 기준일 보유수량 × 주당배당금, 월별·기간 합계 (USD는 지급일 환율로 원화 환산)
- **기간 수익률**: 기간 말 평가수익 + 기간 배당금, 원금 대비 수익금·수익률 (매수 시점 환율 기준이라 환차익 포함)
- **데이터 자동 수집**: 매일 종목 목록·미국 시세·환율을 가져오는 배치, 조회 시 국내 시세·배당을 하루 한 번 갱신

## 기술 스택

- NestJS 12 (모노레포, ESM), TypeScript, rspack
- MySQL + TypeORM (`typeorm-transactional`), decimal.js로 금액 계산
- Zod 요청 검증, Swagger (`/api-docs`, 운영 환경에서는 비활성)
- Passport (Google OAuth 2.0, JWT), `@nestjs/schedule`
- Vitest, oxlint
- 배포: GitHub Actions → EC2 (pm2 + Nginx)

## 외부 데이터

| 제공처 | 용도 |
|---|---|
| Toss Open API | 국내·미국 상장 종목 목록 |
| Massive | USD/KRW 환율, 미국 일별 시세, 미국 배당 |
| 공공데이터포털 (금융위원회) | 국내 주식·ETF 일별 시세 |
| 한국투자증권 Open API | 국내 배당 일정 |

## 구조

```
apps/
  api/     HTTP API (auth, balance, security)
  batch/   매일 도는 수집 작업 (HTTP 없음)
libs/
  common/  DB 설정, TypeORM 엔티티, 통화별 소수점 처리
  core/    외부 API 클라이언트와 수집 서비스 (api·batch 공용)
deploy/    Nginx 설정
```

### 배치 작업 (Asia/Seoul)

| 시각 | 작업 | 내용 |
|---|---|---|
| 08:00 | `overseas-securities` | 미국 상장 종목 목록 |
| 15:00 | `us-daily-prices` | 미국 일별 시세 (최근 7일) |
| 16:00 | `exchange-rates` | USD/KRW 환율 (최근 7일) |
| 17:00 | `domestic-securities` | 국내 상장 종목 목록 |

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/auth/google` | Google 로그인 시작 |
| GET | `/auth/google/callback` | 로그인 완료, 리프레시 토큰 쿠키 발급 후 프론트엔드로 리다이렉트 |
| POST | `/auth/access` | 로그인 직후 액세스 토큰 발급 |
| POST | `/auth/reissue` | 액세스·리프레시 토큰 재발급 |
| GET | `/auth/me` | 내 정보 |
| GET | `/securities` | 종목 검색 |
| GET | `/daily-securities` | 종목 일별 시세 |
| POST | `/balance` | 매수 등록 |
| POST | `/balance/sale` | 매도 등록 |
| GET | `/balance` | 통합잔고 |
| GET | `/balance/purchases` | 종목 매수 내역 |
| DELETE | `/balance/purchases` | 매수 내역 삭제 |
| GET | `/balance/dividends` | 배당금 내역 |
| GET | `/balance/returns` | 기간 수익률 |
| POST | `/daily-securities/import`, `/import/etf`, `/import/us` | 시세 수동 수집 (국내 주식·국내 ETF·미국) |
| POST | `/exchange-rates/import` | 환율 수동 수집 |

요청·응답 형식은 로컬 실행 후 Swagger UI(`http://localhost:8080/api-docs`)에서 볼 수 있습니다.

## 실행

```bash
npm install

# API (기본 포트 8080)
npm run start:dev

# 배치
npm run start:batch:dev

# 배치 작업 하나만 바로 실행하고 종료 (빌드 후)
npm run build:batch
node dist/apps/batch/main --run=exchange-rates
```

MySQL과 루트의 `.env`가 필요합니다. 주요 항목:

- DB: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- 서버: `PORT`, `HOST`, `API_URL`, `FRONTEND_URL1`, `FRONTEND_URL2`, `NODE_ENV`
- 인증: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
- 외부 API: `TOSS_CLIENT_ID`, `TOSS_CLIENT_SECRET`, `MASSIVE_API_KEY`, `DATA_GO_KR_SERVICE_KEY`, `KIS_CLIENT_ID`, `KIS_CLIENT_SECRET`

DB 스키마는 엔티티 정의로 자동 동기화됩니다 (`synchronize: true`).

## 빌드·테스트

```bash
npm run build        # dist/apps/api
npm run build:batch  # dist/apps/batch
npm run lint
npm test
```
