import { z } from 'zod';
import { AccountType, SecurityCompany } from '@app/common';

/** 계좌 생성 본문. accountType을 생략하면 일반(NORMAL) 계좌 */
export const createAccountSchema = z.object({
  securityCompany: z.enum(SecurityCompany),
  accountType: z.enum(AccountType).default(AccountType.NORMAL),
});

export type CreateAccountRequest = z.infer<typeof createAccountSchema>;
