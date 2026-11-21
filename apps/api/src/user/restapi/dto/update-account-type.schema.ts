import { z } from 'zod';
import { AccountType } from '@app/common';

/** 계좌 id (PATCH /accounts/:id/type 경로) */
export const accountIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/** 계좌 타입 변경 본문 */
export const updateAccountTypeSchema = z.object({
  accountType: z.enum(AccountType),
});

export type AccountIdParam = z.infer<typeof accountIdParamSchema>;
export type UpdateAccountTypeRequest = z.infer<typeof updateAccountTypeSchema>;
