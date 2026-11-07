# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See also `AGENTS.md` (NestJS 12 specifics: first-party packages to prefer, ESM rules, NestJS Observe for production data).

## Commands

- `npm run start` / `npm run start:dev` — run the `api` app (Nest CLI, rspack builder). Listens on `PORT` (default 8080); Swagger UI at `/api-docs`.
- `npm run build` — build to `dist/apps/api`; `npm run start:prod` runs the built output.
- `npm run lint` — oxlint, type-aware. `typescript/no-floating-promises` is an error, so always `await` repository calls.
- `npm test` — Vitest unit tests (`**/*.spec.ts`). Single file: `npx vitest run apps/api/src/api.controller.spec.ts`; single test: add `-t "<name>"`.
- `npm run test:e2e` — Vitest with `vitest.config.e2e.ts` (`**/*.e2e-spec.ts`). E2E boots the real `ApiModule`, so it needs a reachable MySQL.

If port 3000 is already in use (the user often has a dev server running), start another instance with `PORT=8081` instead of killing the existing process.

## Architecture

Nest monorepo (`nest-cli.json`, `monorepo: true`), ESM throughout (relative imports end in `.js`).

- `apps/api` — the only application. `ApiModule` is the root: it imports `DatabaseModule` and one feature module per business area. Each feature module registers the entities it uses with its own `TypeOrmModule.forFeature([...])` (e.g. `AuthModule` → `[Oauth, User]`).
  - **Each new business area gets its own folder and module** under `apps/api/src/<feature>/` (e.g. `auth/` → `AuthModule` in `auth/auth.module.ts`). That folder's controllers, strategies, services etc. are declared in its module, not in `ApiModule`.
  - **`ApiModule` only imports the feature module** (`imports: [..., AuthModule]`); don't add a feature's controllers/providers to `ApiModule` directly.
- `libs/common` — shared library, imported as `@app/common` (path alias in `tsconfig.json`, resolved in Vitest via `resolve.tsconfigPaths`). Holds:
  - `DatabaseModule`: global `ConfigModule` (loads `.env` + `dbConfig` from `config/db.config.ts`) and `TypeOrmModule.forRootAsync` for MySQL (`mysql2`) with `synchronize: true` and `autoLoadEntities: true`.
  - TypeORM entities grouped by domain (`user/`, `auth/`) with `BaseTimeEntity` (abstract, `createdAt`/`updatedAt`, no `@Entity`) as a base class.
  - Each folder has an `index.ts` barrel re-exported from `libs/common/src/index.ts`; import entities from `@app/common`.

### Entity conventions

- **Column/property names are unprefixed:** `id`, not `userId`; `name`, not `userName`; `email`, not `oauthEmail`. The entity/table already gives the context.
- **Join column naming:** a relation's `@JoinColumn` normally follows the same rule (e.g. `id`). Only when that name would collide with an existing property of the entity that means something different (e.g. the entity has its own `id` and also references `User`), name the join column `<table name> + <property name>` in camelCase — e.g. `@JoinColumn({ name: 'userId' })`.
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
- `Oauth → User` is a unidirectional `@ManyToOne` (`User` has no `oauth` property), so there is no cascade from `User`. Save the `User` first (`userRepository.save`), then save `Oauth` with `user` set (`oauthRepository.save`), in one `@Transactional()` method (see `AuthService.findOrCreateOauthUser`). `Oauth` has a composite PK (`id` = the user's id, doubling as the `@JoinColumn` to `User`, + `type` enum).

## Environment

`.env` (not committed) supplies `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (must differ), `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` (seconds), `FRONTEND_URL`.

### Auth flow

1. `GET /auth/google` → Google → `GET /auth/google/callback`: `AuthService.issueTokens` saves both tokens in `Token` (one row per user, PK `id` = user id), sets the refresh token as an httpOnly `refreshToken` cookie (`path: /auth`), and redirects to `${FRONTEND_URL}/auth/callback`.
2. Frontend calls `POST /auth/access` with credentials: the refresh token is verified (refresh secret), looked up in `Token`, and a new access token is returned in the body (and stored in `Token`).
3. Frontend sends `Authorization: Bearer <accessToken>`; protect routes with `@UseGuards(AuthGuard('jwt'))` (`JwtStrategy`, access secret; `req.user` is `{ id }`). An expired access token gets 401.
4. On 401, frontend calls `POST /auth/reissue` with credentials: `AuthService.reissueTokens` verifies the cookie's refresh token (expired → 401), looks it up in `Token` (missing → 401), deletes the old row, issues and saves a new access + refresh pair, resets the `refreshToken` cookie, and returns `{ accessToken }`. The old refresh token is unusable afterwards (rotation).

**Keep `/auth/access` and `/auth/reissue` as separate endpoints** — don't merge them or remove `/auth/access`. `/auth/access` is only for right after login (new access token, refresh token unchanged); `/auth/reissue` is for an expired access token (both tokens rotated).

JWTs are signed only through `TokenProvider` (`auth/token.provider.ts`), which passes the access/refresh secret per call (`JwtModule.register({})` has no default secret). A Google OAuth `client_secret_*.json` sits untracked at the repo root — never commit it.
