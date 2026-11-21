import { AccountType, SecurityCompany } from '@app/common';
import { createAccountSchema } from '../../../../src/user/restapi/dto/create-account.schema.js';

describe('createAccountSchema', () => {
  it('accountType을 생략하면 NORMAL', () => {
    expect(createAccountSchema.parse({ securityCompany: 'TOSS' })).toEqual({
      securityCompany: SecurityCompany.TOSS,
      accountType: AccountType.NORMAL,
    });
  });

  it('증권사가 없거나 모르는 값이면 거절한다', () => {
    expect(createAccountSchema.safeParse({}).success).toBe(false);
    expect(
      createAccountSchema.safeParse({ securityCompany: 'NOPE' }).success,
    ).toBe(false);
    expect(
      createAccountSchema.safeParse({ securityCompany: 'TOSS', accountType: 'X' })
        .success,
    ).toBe(false);
  });
});
