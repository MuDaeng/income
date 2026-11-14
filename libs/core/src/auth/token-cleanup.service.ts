import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { authConfig, Token } from '@app/common';

@Injectable()
export class TokenCleanupService {
  constructor(
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  /**
   * refresh token이 만료된 로그인 세션(Token 행)을 삭제.
   * 발급·재발급할 때마다 행이 갱신되므로 updatedAt + refresh 만료 기간(JWT_REFRESH_EXPIRES_IN)이 지난 행은
   * refresh token도 이미 만료됐다
   */
  async deleteExpiredRefreshTokens(): Promise<{ deleted: number }> {
    const expiredBefore = new Date(
      Date.now() - this.auth.jwtRefreshExpiresIn * 1000,
    );
    const result = await this.tokenRepository.delete({
      updatedAt: LessThan(expiredBefore),
    });
    return { deleted: result.affected ?? 0 };
  }
}
