# income

국내(KOSPI·KOSDAQ)·미국(NYSE·NASDAQ·AMEX) 주식과 ETF의 매수·매도 내역을 기록하고, 보유 잔고의 평가금액·수익률과 배당금을 원화 기준으로 보여주는 자산 관리 서비스의 백엔드입니다.

- API: `https://api.mudaeng.online`
- 프론트엔드: `https://www.mudaeng.online`

## 주요 기능

- **Google 로그인**: Google OAuth 후 JWT 액세스 토큰과 httpOnly 쿠키의 리프레시 토큰(재발급 시 교체)으로 인증
- **종목 검색**: 종목코드(심볼) 또는 종목명으로 검색하고, 종목별 일별 시세·월별 주당 배당금 조회
- **잔고 관리**: 계좌(증권사·계좌타입)별 매수 등록, 매도·일괄매도(최근 매수분부터) 처리, 구매 환율 수정·계좌 이동, 잘못 등록한 매수분 삭제, 매수 내역 조회
- **계좌**: 사용자별 계좌(증권사 + 일반·ISA·IRP·연금저축) 생성·목록·삭제·계좌 타입 변경. 매수 시 그 증권사 계좌가 없으면 일반 계좌를 자동 생성
- **Toss 거래내역 가져오기**: Toss 거래내역(매수·매도·입출고)으로 지정한 Toss 계좌 잔고를 한 번에 다시 등록 (체결일 = 결제일 − 2거래일). 주식 빌려주기 출고·반환은 자동 상쇄하고, 반환되지 않은 출고는 대여 중 목록으로 돌려줘 사용자가 실제 출고로 확정할 수 있음
- **통합잔고**: 종목별 매입평균가·평가금액·수익률과 한국/미국/전체 합계 (USD는 최신 환율로 원화 환산)
- **배당금 내역**: 배당락일 전날 보유수량 × 주당배당금, 월별·기간 합계, 세전·세후 (일반 계좌만 원천징수 반영, USD는 지급일 환율로 원화 환산)
- **배당 지표**: 보유 종목별 최근 12개월 주당 배당, 예상 연배당, YOC(매입가 대비 배당률), 현재 배당률, 배당 성장률
- **기간 수익률**: 기간 말 평가수익 + 기간 배당금, 원금 대비 수익금·수익률 (매수 시점 환율 기준이라 환차익 포함)
- **월별 잔고**: 월말별 원금·평가금액·누적 배당금
- **관리자**: 배치 실행 이력, 종목별 국내 시세 조회 이력 (`admin` 권한 사용자만)
- **데이터 자동 수집**: 매일 종목 목록·국내/미국 시세·환율을 가져오는 배치, 조회 시 배당을 하루 한 번 갱신하고 국내 시세 하루치를 KIS로 보충 (API에는 수집용 엔드포인트가 없음)
- **보안**: Google 로그인 CSRF 방지(state 쿠키), IP별 요청 수 제한(기본 분당 100회, 인증·공개 조회 API는 더 낮게)

## 기술 스택

- NestJS 12 (모노레포, ESM), TypeScript, rspack
- MySQL + TypeORM (`typeorm-transactional`), decimal.js로 금액 계산
- Zod 요청 검증, Swagger (`/api-docs`, 운영 환경에서는 비활성)
- Passport (Google OAuth 2.0, JWT), `@nestjs/schedule`, `@nestjs/throttler`
- Vitest, oxlint
- 배포: GitHub Actions → EC2 (pm2 + Nginx)

## 외부 데이터

| 제공처 | 용도 |
|---|---|
| Toss Open API | 국내·미국 상장 종목 목록 |
| Massive | USD/KRW 환율, 미국 일별 시세, 미국 배당 |
| 공공데이터포털 (금융위원회) | 국내 주식·ETF 일별 시세 |
| 한국투자증권 Open API | 국내 배당 일정, 국내 일별 시세 하루치 보충 |

## 구조

```
apps/
  api/     HTTP API (admin, auth, balance, security, user)
  batch/   매일 도는 수집·정리 작업 (HTTP 없음)
libs/
  common/  DB 설정, TypeORM 엔티티, 외부 API 클라이언트, JWT 발급, 수집 로직 (api·batch 공용)
deploy/    Nginx 설정
```

### 배치 작업 (Asia/Seoul)

| 시각 | 작업 | 내용 |
|---|---|---|
| 00:00 | `expired-tokens` | 만료된 로그인 세션(리프레시 토큰) 삭제 |
| 08:00 | `overseas-securities` | 미국 상장 종목 목록 |
| 13:30 | `domestic-daily-prices` | 국내 주식·ETF 일별 시세 (오늘~4일 전, data.go.kr) |
| 14:30 | `us-daily-prices` | 미국 일별 시세 (최근 7일) |
| 16:00 | `exchange-rates` | USD/KRW 환율 (최근 7일) |
| 17:00 | `domestic-securities` | 국내 상장 종목 목록 |

실패한 작업은 로그만 남기고 프로세스는 계속 돕니다. 실행마다 결과가 `batch_history` 테이블에 남습니다.

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/auth/google` | Google 로그인 시작 |
| GET | `/auth/google/callback` | 로그인 완료, 리프레시 토큰 쿠키 발급 후 프론트엔드로 리다이렉트 |
| POST | `/auth/access` | 로그인 직후 액세스 토큰 발급 |
| POST | `/auth/reissue` | 액세스·리프레시 토큰 재발급 |
| GET | `/auth/me` | 내 정보 |
| POST | `/accounts` | 계좌 생성 (증권사 필수, 계좌 타입 생략 시 일반) |
| GET | `/accounts` | 내 계좌 목록 (`securityCompany`를 주면 그 증권사 계좌만) |
| DELETE | `/accounts/:id` | 계좌 삭제 (매수 내역이 남아 있으면 거절 — 먼저 다른 계좌로 옮기거나 삭제) |
| PATCH | `/accounts/:id/type` | 계좌 타입 변경 (일반·ISA·IRP·연금저축) |
| GET | `/securities` | 종목 검색 |
| GET | `/daily-securities` | 종목 일별 시세 |
| GET | `/dividends` | 종목 월별 1주당 현금배당금 |
| POST | `/balance` | 매수 등록 (증권사 `securityCompany` 필수, `accountId` 선택 — 없으면 그 증권사 첫 계좌, 그것도 없으면 일반 계좌 생성) |
| POST | `/balance/sale` | 매도 등록 |
| POST | `/balance/sale/bulk` | 계좌별 일괄매도 (매수일 최근 순) |
| POST | `/balance/toss` | Toss 거래내역으로 Toss 계좌 잔고 일괄 재등록 (`accountId` 선택, 주식 빌려주기 출고·반환 자동 상쇄, 실제 출고는 `confirmedTransfersOut`로 지정) |
| GET | `/balance` | 통합잔고 (`accountId`를 주면 그 계좌만) |
| GET | `/balance/purchases` | 종목 매수 내역 (`accountId`를 주면 그 계좌만) |
| PATCH | `/balance/purchases` | 매수분 구매 환율 수정 |
| PATCH | `/balance/purchases/account` | 매수분을 내 다른 계좌로 이동 (타사 이전 등) |
| DELETE | `/balance/purchases` | 매수 내역 삭제 |
| GET | `/balance/dividends` | 배당금 내역, 세전·세후, 지급 예정 배당은 `scheduled`로 분리 (일반 계좌만 국내 15.4%·미국 15% 과세, `accountId`를 주면 그 계좌 보유분만) |
| GET | `/balance/dividend-metrics` | 배당 지표: 보유 종목별 최근 12개월 주당 배당·예상 연배당·YOC·현재 배당률·배당 성장률(세전) (`accountId`를 주면 그 계좌만) |
| GET | `/balance/monthly` | 월말별 원금·평가금액·평가금액+누적배당금 (from~to 년월, 이번 달은 오늘 기준, `accountId`를 주면 그 계좌만) |
| GET | `/balance/returns` | 기간 수익률, 배당·수익금·수익률 세전·세후 (`accountId`를 주면 그 계좌만) |
| GET | `/admin/batch-histories` | 배치 실행 이력 (관리자) |
| GET | `/admin/security-searches/price` | 종목별 국내 시세 조회 이력 (관리자) |

관리자 권한은 DB에서만 부여합니다: `INSERT INTO user_rule (id, rule) VALUES (<userId>, 'admin');` (다음 토큰 발급부터 적용)

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
# --run=exchange-rates | domestic-securities | overseas-securities | us-daily-prices | domestic-daily-prices | expired-tokens
```

MySQL과 루트의 `.env`가 필요합니다. 주요 항목:

- DB: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- 서버: `PORT`, `HOST`, `API_URL`, `FRONTEND_URL1`, `FRONTEND_URL2`, `NODE_ENV`
- 인증: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
- 외부 API: `TOSS_CLIENT_ID`, `TOSS_CLIENT_SECRET`, `MASSIVE_API_KEY`, `DATA_GO_KR_SERVICE_KEY`, `KIS_CLIENT_ID`, `KIS_CLIENT_SECRET`

DB 스키마는 엔티티 정의로 자동 동기화됩니다 (`synchronize: true`).

외래키가 걸린 테이블의 PK를 바꿀 때는 `synchronize`가 `Cannot drop index 'PRIMARY': needed in a foreign key constraint`로 실패하므로 나눠서 배포합니다.

1. 관련 `@ManyToOne` 관계를 빼고 배포 → 외래키 삭제 후 PK·컬럼 변경
2. 새 외래키가 참조할 부모 행을 DB에 직접 추가 (예: `account`)
3. 관계를 되돌려 배포 → 외래키 재생성

## 빌드·테스트

```bash
npm run build        # dist/apps/api
npm run build:batch  # dist/apps/batch
npm run lint
npm test
```
