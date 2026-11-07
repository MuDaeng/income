# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See also `AGENTS.md` (NestJS 12 specifics: first-party packages to prefer, ESM rules, NestJS Observe for production data).

## Commands

- `npm run start` / `npm run start:dev` — run the `api` app (Nest CLI, rspack builder). Listens on `PORT` (default 3000); Swagger UI at `/api-docs`.
- `npm run build` — build to `dist/apps/api`; `npm run start:prod` runs the built output.
- `npm run lint` — oxlint, type-aware. `typescript/no-floating-promises` is an error, so always `await` repository calls.
- `npm test` — Vitest unit tests (`**/*.spec.ts`). Single file: `npx vitest run apps/api/src/api.controller.spec.ts`; single test: add `-t "<name>"`.
- `npm run test:e2e` — Vitest with `vitest.config.e2e.ts` (`**/*.e2e-spec.ts`). E2E boots the real `ApiModule`, so it needs a reachable MySQL.

If port 3000 is already in use (the user often has a dev server running), start another instance with `PORT=3001` instead of killing the existing process.

## Architecture

Nest monorepo (`nest-cli.json`, `monorepo: true`), ESM throughout (relative imports end in `.js`).

- `apps/api` — the only application. `ApiModule` imports `DatabaseModule` and registers repositories via `TypeOrmModule.forFeature([...])`.
- `libs/common` — shared library, imported as `@app/common` (path alias in `tsconfig.json`, resolved in Vitest via `resolve.tsconfigPaths`). Holds:
  - `DatabaseModule`: global `ConfigModule` (loads `.env` + `dbConfig` from `config/db.config.ts`) and `TypeOrmModule.forRootAsync` for MySQL (`mysql2`) with `synchronize: true` and `autoLoadEntities: true`.
  - TypeORM entities grouped by domain (`user/`, `auth/`) with `BaseTimeEntity` (abstract, `createdAt`/`updatedAt`, no `@Entity`) as a base class.
  - Each folder has an `index.ts` barrel re-exported from `libs/common/src/index.ts`; import entities from `@app/common`.

### Entity conventions

- **Column/property names are unprefixed:** `id`, not `userId`; `name`, not `userName`; `email`, not `oauthEmail`. The entity/table already gives the context.
- **Join column naming:** a relation's `@JoinColumn` normally follows the same rule (e.g. `id`). Only when that name would collide with an existing property of the entity that means something different (e.g. the entity has its own `id` and also references `User`), name the join column `<table name> + <property name>` in camelCase — e.g. `@JoinColumn({ name: 'userId' })`.
- **Relations are unidirectional by default.** Declare the relation only on the owning side (the side with the `@JoinColumn`, usually `@ManyToOne`/`@OneToOne`) and omit the inverse `@OneToMany`/inverse-side callback. Add a bidirectional relation only when it is truly unavoidable, and note why in a comment.

### TypeORM gotchas in this setup

- `autoLoadEntities` only loads entities passed to some `forFeature()`. Every entity on either side of a relation must be registered, or startup fails with `Entity metadata for X#y was not found`.
- `synchronize: true` alters the live DB schema on every boot from entity definitions — entity changes are schema changes.
- `Oauth → User` is a unidirectional `@ManyToOne` (`User` has no `oauth` property), so there is no cascade from `User`. Save the `User` first, then save `Oauth` with `user` set, inside one `dataSource.transaction(...)` (see `ApiService`). `Oauth` has a composite PK (`id` = the user's id, doubling as the `@JoinColumn` to `User`, + `type` enum).

## Environment

`.env` (not committed) supplies `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT`. A Google OAuth `client_secret_*.json` sits untracked at the repo root — never commit it.
