# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See also `AGENTS.md` (NestJS 12 specifics: first-party packages to prefer, ESM rules, NestJS Observe for production data).

## Commands

- `npm run start` / `npm run start:dev` — run the `api` app (Nest CLI, rspack builder). Listens on `PORT` (default 8080); Swagger UI at `/api-docs`.
- `npm run build` — build to `dist/apps/api`; `npm run start:prod` runs the built output.
- `npm run lint` — oxlint, type-aware. `typescript/no-floating-promises` is an error, so always `await` repository calls.
- `npm test` — Vitest unit tests (`**/*.spec.ts`). Single file: `npx vitest run apps/api/src/api.controller.spec.ts`; single test: add `-t "<name>"`.
- `npm run test:e2e` — Vitest with `vitest.config.e2e.ts` (`**/*.e2e-spec.ts`). E2E boots the real `ApiModule`, so it needs a reachable MySQL.

If port 8080 is already in use (the user often has a dev server running), start another instance with `PORT=8081` instead of killing the existing process.

## Architecture

Nest monorepo (`nest-cli.json`, `monorepo: true`), ESM throughout (relative imports end in `.js`).

- `apps/api` — the only application. `ApiModule` is the root: it imports `DatabaseModule` and one feature module per business area. Each feature module registers the entities it uses with its own `TypeOrmModule.forFeature([...])` (e.g. `AuthModule` → `[Oauth, User, Token]`).
  - **Each new business area gets its own folder and module** under `apps/api/src/<feature>/` (e.g. `auth/` → `AuthModule` in `auth/auth.module.ts`). That folder's controllers, strategies, services etc. are declared in its module, not in `ApiModule`.
  - **Feature folders follow the entity domains of `libs/common`.** Code working on entities from `libs/common/src/<domain>/` goes in `apps/api/src/<domain>/` and its one module — e.g. `DailySecurity` and `DailyExchangeRate` live in `libs/common/src/security/`, so their controllers/services (`daily-security.*`, `exchange-rate.*`) sit flat in `security/` and are registered in `SecurityModule`. Don't create a separate feature folder per entity.
  - **External API clients go in `apps/api/src/clients/<name>/`**, one folder and module per provider (`clients/toss/` → `TossModule`, `clients/massive/` → `MassiveModule`, `clients/data-go-kr/` → `DataGoKrModule`, `clients/kis/` → `KisModule`), each exporting its client and holding its response types in `<name>.types.ts`. Feature modules import the client module.
  - **`ApiModule` only imports the feature module** (`imports: [..., AuthModule]`); don't add a feature's controllers/providers to `ApiModule` directly.
  - **Controllers only call services.** A controller class contains only route handler methods, and each handler just passes request inputs to a service method and returns its result. No private/helper methods, no business logic, no repository or `TokenProvider` access in controllers — put that logic in the service. Need the response? Don't take `@Res()`: return `{ url }` with `@Redirect()`, and set cookies from the service via `RefreshTokenContext.setRefreshTokenCookie`.
- `libs/common` — shared library, imported as `@app/common` (path alias in `tsconfig.json`, resolved in Vitest via `resolve.tsconfigPaths`). Holds:
  - `DatabaseModule`: global `ConfigModule` (loads `.env` + `dbConfig` from `config/db.config.ts`) and `TypeOrmModule.forRootAsync` for MySQL (`mysql2`) with `synchronize: true` and `autoLoadEntities: true`.
  - TypeORM entities grouped by domain (`user/`, `auth/`) with `BaseTimeEntity` (abstract, `createdAt`/`updatedAt`, no `@Entity`) as a base class.
  - Each folder has an `index.ts` barrel re-exported from `libs/common/src/index.ts`; import entities from `@app/common`.

### Decorators

**Request inputs in controllers come only from parameter decorators — never `@Req()` / `@Res()`.**

- Body/params/query: Nest's `@Body()`, `@Param()`, `@Query()`.
- **Validate request input with a Zod schema on the decorator:** `@Body({ schema: xSchema }) body: XRequest` (same for `@Param`/`@Query`). The global `StandardSchemaValidationPipe` in `main.ts` runs it and returns 400 with per-field messages; Swagger picks the schema up automatically. Put the schema in `<feature>/<name>.schema.ts` and export its type with `z.infer` (e.g. `balance/register-balance.schema.ts`). Decimal inputs are strings (`/^d+(.d+)?$/`); in Zod 4 a `refine` still runs after a failed `regex`, so guard it before calling `new Decimal(value)` or invalid input turns into a 500. E2E tests that build the app without `main.ts` must add `app.useGlobalPipes(new StandardSchemaValidationPipe())` themselves.
- Authenticated user: a custom param decorator that matches the route's guard. Using the decorator without its guard gives `undefined`.

  | Guard on the route | Decorator | Value |
  |---|---|---|
  | `@UseGuards(AuthGuard('jwt'))` (Bearer access token) | `@CurrentUser()` | `AuthUser` (`{ id }`) |
  | `@UseGuards(AuthGuard('google'))` (Google callback) | `@GoogleUser()` | `User` from `GoogleStrategy.validate` |
  | `@UseGuards(RefreshTokenGuard)` (refresh token cookie) | none — the service reads `RefreshTokenContext.getRefreshToken()` / `getSub()` | |

- Responses: return the value; use `@Redirect()` + return `{ url }` for redirects, and `@HttpCode(200)` on `POST` routes that don't create anything (`/auth/access`, `/auth/reissue`).

**New custom param decorators:**

- One per file, `<name>.decorator.ts`, in the feature folder (e.g. `auth/current-user.decorator.ts`); export a `PascalCase` const built with `createParamDecorator`, with an explicit return type.
- Only extract a value from the request (usually what a guard/strategy put on `req.user`). No validation, DB access or other logic — that belongs in the guard/strategy or the service.
- Add a JSDoc line naming the guard it requires.
- When a new guard type needs its user, add a new decorator rather than reusing one with a different shape (that's why `@GoogleUser()` exists alongside `@CurrentUser()`).

**Swagger decorators on every controller/handler:** `@ApiTags('<feature>')` on the controller; `@ApiOperation({ summary: '<Korean description>' })` on each handler; `@ApiBearerAuth()` next to `AuthGuard('jwt')`; `@ApiCookieAuth(REFRESH_TOKEN_COOKIE)` next to `RefreshTokenGuard`.

**Other decorators:** `@Transactional()` only on service methods (see Data access); `@InjectRepository()` only in constructors.

### Entity conventions

- **Column/property names are unprefixed:** `id`, not `userId`; `name`, not `userName`; `email`, not `oauthEmail`. The entity/table already gives the context.
- **Join column naming:** a relation's `@JoinColumn` normally follows the same rule (e.g. `id`). Only when that name would collide with an existing property of the entity that means something different (e.g. the entity has its own `id` and also references `User`), name the join column `<table name> + <property name>` in camelCase — e.g. `@JoinColumn({ name: 'userId' })`.
- **Prices, quantities and money amounts use `@Column(decimalColumn)` with TS type `string`** (`libs/common/src/base/decimal-column.ts`: `DECIMAL(20, 6)`, no transformer — mysql2 returns DECIMAL as a string like `'123.450000'`). Don't use plain `@Column()` (`int`), and never convert them to `number`.
  - **Do all arithmetic with decimal.js** (`import { Decimal } from 'decimal.js'` — the default import doesn't type-check under NodeNext). Accept inputs as `Decimal.Value`.
  - **Before saving, truncate by the security's currency with `truncateByCurrency(value, security.currency)`** (`libs/common/src/security/currency-decimal.ts`): `KRW` (domestic stocks/bonds) → integer, `USD` (overseas) → 6 decimal places, always `ROUND_DOWN`. This applies to both money and quantities. Look the `Security` up in the service to get its currency (see `BalanceService.registerBalance`).
- **Enum columns need `@Column({ type: 'enum', enum: X })`** — a bare `@Column()` on an enum-typed property fails at startup with `Data type "undefined" ... is not supported`.
- **Composite-FK join columns must name their target:** `@JoinColumn([{ name: 'userId', referencedColumnName: 'userId' }, { name: 'securityId', referencedColumnName: 'securityId' }])`. Without `referencedColumnName`, TypeORM mapped both to `userId` (`FOREIGN KEY (userId, userId)`, then `Duplicate column name`).
- **Relations are unidirectional by default.** Declare the relation only on the owning side (the side with the `@JoinColumn`, usually `@ManyToOne`/`@OneToOne`) and omit the inverse `@OneToMany`/inverse-side callback. Add a bidirectional relation only when it is truly unavoidable, and note why in a comment.

### Data access: Repository only

- **All CRUD goes through TypeORM `Repository`**, using its methods (`find*`, `save`, `insert`, `update`, `delete`, ...).
- **Repositories are obtained only by constructor injection with `@InjectRepository`:**
  ```ts
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}
  ```
  The entity must be in a `TypeOrmModule.forFeature([...])` imported by that feature's module. Don't get repositories any other way (`dataSource.getRepository(...)`, `manager.getRepository(...)`, custom repository classes).
- Don't do CRUD via `EntityManager` methods (`manager.save(Entity, ...)`, `dataSource.manager.*`), `createQueryBuilder`, or raw `query()`.
- **Transactions use `@Transactional()` from `typeorm-transactional`** on a service method; injected repositories automatically join the transaction, and a thrown error rolls everything back. Don't use `dataSource.transaction(...)` or `QueryRunner`. Setup (already done): `initializeTransactionalContext()` in `main.ts` before `NestFactory.create`, and `addTransactionalDataSource` in `DatabaseModule`'s `dataSourceFactory`. Tests that call a `@Transactional()` method against a real DB must call `initializeTransactionalContext()` first.

### TypeORM gotchas in this setup

- `autoLoadEntities` only loads entities passed to some `forFeature()`. Every entity on either side of a relation must be registered, or startup fails with `Entity metadata for X#y was not found`.
- `synchronize: true` alters the live DB schema on every boot from entity definitions — entity changes are schema changes.
- **Per-group sequence numbers (max + 1) are assigned in the service, not in entity listeners** (`@BeforeInsert` has no DI and would need a global DataSource + QueryBuilder). In a `@Transactional()` method, first lock the owning parent row by PK (e.g. `userRepository.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } })`), then read the group's last row with `findOne({ order: { sequence: 'DESC' } })` and save with `+ 1`. Don't put the lock on the sequence table's own range query: InnoDB gap locks make concurrent inserts deadlock (verified — 2 of 5 concurrent saves failed even with 3 retries). A PK lookup on the parent takes a plain record lock, so same-owner saves run one at a time with no deadlock (verified with 10 concurrent saves). See `BalanceService.registerBalance`.
- `Oauth → User` is a unidirectional `@ManyToOne` (`User` has no `oauth` property), so there is no cascade from `User`. Save the `User` first (`userRepository.save`), then save `Oauth` with `user` set (`oauthRepository.save`), in one `@Transactional()` method (see `AuthService.findOrCreateOauthUser`). `Oauth` has a composite PK (`id` = the user's id, doubling as the `@JoinColumn` to `User`, + `type` enum).

## Environment

`.env` (not committed) supplies `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (must differ), `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` (seconds), `FRONTEND_URL`, `TOSS_CLIENT_ID` / `TOSS_CLIENT_SECRET` (Toss Open API; the calling machine's IP must be on Toss's allowed-IP list, otherwise 403), `MASSIVE_API_KEY` (Massive REST API, sent as `Authorization: Bearer`), `DATA_GO_KR_SERVICE_KEY` (data.go.kr decoding key, sent as the `serviceKey` query param), `KIS_CLIENT_ID` / `KIS_CLIENT_SECRET` (Korea Investment & Securities Open API appkey/appsecret).

### Toss Open API

Call Toss only through `TossClient` (`clients/toss/toss.client.ts`, exported by `TossModule`). It caches the access token in memory until shortly before expiry: Toss allows one valid token per client, so issuing a new one revokes the previous token — never request a token per call. `GET /api/v1/stocks/all` is rate-limited to 1 request/second (the import waits between markets). `POST /securities/import` (`SecurityService.importFromToss`) upserts every KOSPI/KOSDAQ/NYSE/NASDAQ/AMEX listing into `Security` (`id` = ISIN, currency from the market).

### Massive API

Call Massive only through `MassiveClient` (`clients/massive/massive.client.ts`, exported by `MassiveModule`). `POST /exchange-rates/import` (`ExchangeRateService.importFromMassive`, body `{ from?, to? }`, default the last 2 years) fetches `C:USDKRW` daily bars and upserts them into `DailyExchangeRate` as `currency = USD` (KRW per USD; `date` = the bar's UTC date). Rates keep 6 decimals (`ROUND_DOWN`) — don't use `truncateByCurrency` on them, KRW would cut them to integers. The Currencies Basic plan only serves 2 years of end-of-day data.

`POST /daily-securities/import/us` (`DailySecurityService.importUsFromMassive`, same body) calls the Daily Market Summary (`/v2/aggs/grouped/locale/us/market/stocks/{date}`) once per weekday — one call returns every US ticker for that day, holidays return no results — and upserts the bars into `DailySecurity` for `USD` securities, matched by `Security.symbol` (Toss preferred-share symbols `BAC-P` become Massive `BACpP`; unknown tickers are skipped; the conversion is `toMassiveTicker` in `clients/massive/massive-ticker.ts`). Prices use `truncateByCurrency(USD)`.

`MassiveClient.getDividends(ticker, fromExDate, toExDate)` reads `/stocks/v1/dividends` (cash dividends, filtered by ex-dividend date, `limit=5000`, follows `next_url`). `DividendService` uses it for `USD` securities (see KIS Open API below). `MassiveClient` retries a 429 after `Retry-After` (default 15s), so a rate-limited plan just runs slower.

### data.go.kr

Call data.go.kr only through `DataGoKrClient` (`clients/data-go-kr/data-go-kr.client.ts`, exported by `DataGoKrModule`). `POST /daily-securities/import` (`DailySecurityService.importFromDataGoKr`, body `{ from?, to? }`, default the last 2 years) pages through the FSC stock price API (`getStockPriceInfo_V2`, domestic listed stocks only, ~2,900 rows per trading day, 10,000 rows per page) and upserts each page into `DailySecurity` right away. Rows are matched by ISIN (`isinCd` = `Security.id`); ISINs not in `security` as KRW are skipped (they would violate the FK). `endBasDt` is exclusive, so the service passes `to + 1 day`. Errors such as an unregistered key come back as `OpenAPI_ServiceResponse` (or XML) instead of `response.header`, and the client turns them into 502.

`POST /daily-securities/import/etf` (`DailySecurityService.importEtfFromDataGoKr`, same body and paging) does the same for domestic ETFs from the FSC securities product price API (`GetSecuritiesProductInfoService_V2/getETFPriceInfo_V2`, same query and response shape — both go through `DataGoKrClient.getPricePage`). The stock price API has no ETFs, so ETF balances can't be registered until this has run. The data.go.kr key needs a separate 활용신청 for 증권상품시세정보; otherwise the call returns `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` (502).

### KIS Open API

Call KIS (한국투자증권, `https://openapi.koreainvestment.com:9443`) only through `KisClient` (`clients/kis/kis.client.ts`, exported by `KisModule`). The access token (`POST /oauth2/tokenP`) is stored in `ClientToken` (`clientType = KIS`; `token` is `text` because the JWT is longer than 255 chars) and reused across calls and restarts — never issue one per call. `KisClient` issues a token only when none is stored, or once when a call returns 401 (KIS may also report an expired token as HTTP 500 with `msg_cd` `EGW00121`/`EGW00123`), saves it, and retries that call once.

Dividends for `KRW` securities come from the KSD dividend schedule (`GET /uapi/domestic-stock/v1/ksdinfo/dividend`, `tr_id` `HHKDB669102C0`, per 6-digit `Security.symbol`); `USD` securities use Massive Dividends with `toMassiveTicker(symbol)` (amount `truncateByCurrency(USD)`, `noticeDate` = record date, or ex-dividend date if missing). `DividendService.refreshDividends(security)` (`security/dividend.service.ts`, exported by `SecurityModule`) fetches at most once a day per security: if `SecuritySearch.lastSearchDate` is today (Asia/Seoul) it does nothing; otherwise it fetches from 2 years back to 1 year ahead, upserts `Dividend` (cash → `MONEY`; KIS stock dividends → `STOCK`, rate in %; rows without a payment date are skipped since it is part of the PK) and sets `lastSearchDate` to today. Other currencies are ignored. `BalanceService.registerBalance` calls it only after the registration transaction (`saveBalance`, `@Transactional()`) has committed — a failed registration never calls KIS, and a rolled-back registration can't take the dividend rows with it. A KIS failure is logged and does not fail the registration. KIS issues at most one token per minute (`EGW00133`). Reuse it for future security lookup APIs instead of calling `KisClient` directly.

### Dividend history

`GET /balance/dividends?from&to` (`DividendHistoryService.getDividendHistory`, `balance/dividend-history.*`) reads only stored `Dividend` rows — it never calls KIS/Massive. Rules: cash dividends (`MONEY`) only; `from`/`to` filter `paymentDate` (inclusive; omitted = unbounded, so announced future payments are included) and months group by payment month; quantity = sum of the user's `PurchaseDateBalance` rows (sold ones included) with `purchaseDate <= noticeDate` and (`saleDate` null or `> noticeDate`), rows with quantity 0 are dropped; amount = per-share × quantity, `truncateByCurrency`. USD converts with the latest USD `closingRate` on or before `paymentDate` (`krwAmount` null and left out of the sums if none). Monthly/total sums add the truncated per-row values.

`GET /balance/returns?from&to` (both required; `PeriodReturnService`, `balance/period-return.*`) values the positions held on `to` (`purchaseDate <= to`, `saleDate` null or `> to`; sale prices aren't stored, so sold positions only count through their dividends) at the latest closing price on or before `to`, and adds dividends from `DividendHistoryService` for the same `from`/`to`. USD cost in KRW uses each purchase's own rate (latest USD rate on or before `purchaseDate`, so FX gains are in the KRW return); USD evaluation uses the latest rate on or before `to`. Securities = held on `to` ∪ paid a dividend in the period. `returnRate` lives in `balance/return-rate.ts` (shared with `BalanceService`).

### Auth flow

1. `GET /auth/google` → Google → `GET /auth/google/callback`: the handler takes the Google user with `@GoogleUser()` (`auth/google-user.decorator.ts`, the `User` returned by `GoogleStrategy.validate`) and `AuthService.loginWithOauth` saves both tokens in `Token` (one row per user, PK `id` = user id), sets the refresh token as an httpOnly `refreshToken` cookie (`path: /auth`), and returns `{ url: ${FRONTEND_URL}/auth/callback }` for `@Redirect()`.
2. Frontend calls `POST /auth/access` with credentials: `AuthService.issueAccessToken` looks the refresh token up in `Token` and returns a new access token in the body (also stored in `Token`); the refresh token is unchanged.
3. Frontend sends `Authorization: Bearer <accessToken>`; protect routes with `@UseGuards(AuthGuard('jwt'))` (`JwtStrategy`, access secret) and take the user with the `@CurrentUser()` param decorator (`auth/current-user.decorator.ts`, gives `AuthUser` = `{ id }`) instead of `@Req()`, passing it to the service (e.g. `GET /auth/me` → `AuthService.getMe`). An expired access token gets 401.
4. On 401, frontend calls `POST /auth/reissue` with credentials: `AuthService.reissueTokens` looks the refresh token up in `Token` (missing → 401), deletes the old row, issues and saves a new access + refresh pair, resets the `refreshToken` cookie, and returns `{ accessToken }`. The old refresh token is unusable afterwards (rotation).

**Refresh-token context** (`auth/refresh-token.context.ts`, holding `RefreshTokenContext` + `RefreshTokenContextMiddleware` because the middleware must open the file-private `AsyncLocalStorage`): the middleware opens a per-request store (applied to all routes in `AuthModule.configure`). `@UseGuards(RefreshTokenGuard)` (`auth/refresh-token.guard.ts`) reads the `refreshToken` cookie, verifies it (missing/expired/invalid → 401), and stores the token and its `sub` (user id). Services then read them with `RefreshTokenContext.getRefreshToken()` / `getSub()` instead of taking them as parameters, and set the cookie with `RefreshTokenContext.setRefreshTokenCookie(token)`. `AuthModule` exports `RefreshTokenContext` and `RefreshTokenGuard` for other feature modules.

**Keep `/auth/access` and `/auth/reissue` as separate endpoints** — don't merge them or remove `/auth/access`. `/auth/access` is only for right after login (new access token, refresh token unchanged); `/auth/reissue` is for an expired access token (both tokens rotated).

JWTs are signed only through `TokenProvider` (`auth/token.provider.ts`), which passes the access/refresh secret per call (`JwtModule.register({})` has no default secret). A Google OAuth `client_secret_*.json` sits untracked at the repo root — never commit it.
