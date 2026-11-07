import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { Oauth, OAuthType, Token, User } from '@app/common';
import { TokenProvider } from './token.provider.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Oauth)
    private readonly oauthRepository: Repository<Oauth>,
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    private readonly tokenProvider: TokenProvider,
  ) {}

  @Transactional()
  async findOrCreateOauthUser(type: OAuthType, name: string): Promise<User> {
    const oauth = await this.oauthRepository.findOne({
      where: { type, name },
      relations: { user: true },
    });
    if (oauth) {
      return oauth.user;
    }

    const user = await this.userRepository.save(this.userRepository.create());
    await this.oauthRepository.save(
      this.oauthRepository.create({ user, type, name }),
    );
    return user;
  }

  /** OAuth 로그인 성공 시 access/refresh token 발급 후 Token 테이블에 저장 (사용자당 1행, 덮어씀) */
  @Transactional()
  async issueTokens(
    user: User,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.tokenProvider.createAccessToken(user.id);
    const refreshToken = await this.tokenProvider.createRefreshToken(user.id);
    await this.tokenRepository.save(
      this.tokenRepository.create({
        id: user.id,
        user,
        accessToken,
        refreshToken,
      }),
    );
    return { accessToken, refreshToken };
  }

  /** cookie의 refresh token을 검증하고 Token 테이블에서 조회한 뒤 새 access token 발급 */
  @Transactional()
  async reissueAccessToken(refreshToken: string | undefined): Promise<string> {
    if (!refreshToken) {
      throw new UnauthorizedException('refresh token이 없습니다.');
    }
    const payload = await this.tokenProvider.verifyRefreshToken(refreshToken);

    const token = await this.tokenRepository.findOne({
      where: { refreshToken },
    });
    if (!token || token.id !== payload.sub) {
      throw new UnauthorizedException('등록되지 않은 refresh token입니다.');
    }

    token.accessToken = await this.tokenProvider.createAccessToken(token.id);
    await this.tokenRepository.save(token);
    return token.accessToken;
  }

  /**
   * access token 만료 시 재발급 (refresh token rotation).
   * refresh token 만료 여부 확인 → Token 테이블 조회 (없으면 401)
   * → 기존 Token 삭제 → access/refresh token 새로 발급해서 저장
   */
  @Transactional()
  async reissueTokens(
    refreshToken: string | undefined,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!refreshToken) {
      throw new UnauthorizedException('refresh token이 없습니다.');
    }
    const payload = await this.tokenProvider.verifyRefreshToken(refreshToken);

    const token = await this.tokenRepository.findOne({
      where: { refreshToken },
      relations: { user: true },
    });
    if (!token || token.id !== payload.sub) {
      throw new UnauthorizedException('등록되지 않은 refresh token입니다.');
    }

    await this.tokenRepository.delete({ id: token.id });

    const newAccessToken = await this.tokenProvider.createAccessToken(token.id);
    const newRefreshToken = await this.tokenProvider.createRefreshToken(token.id);
    await this.tokenRepository.save(
      this.tokenRepository.create({
        id: token.id,
        user: token.user,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      }),
    );
    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }
}
