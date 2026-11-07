import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { authConfig, Oauth, OAuthType, Token, User } from '@app/common';
import { RefreshTokenContext } from './refresh-token.context.js';
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
    private readonly refreshTokenContext: RefreshTokenContext,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
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

  /**
   * OAuth 로그인 성공 시 access/refresh token 발급 후 Token 테이블에 저장 (사용자당 1행, 덮어씀),
   * refresh token을 cookie에 설정하고 프론트엔드 callback 주소를 반환
   */
  @Transactional()
  async loginWithOauth(user: User): Promise<{ url: string }> {
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
    this.refreshTokenContext.setRefreshTokenCookie(refreshToken);
    return { url: `${this.auth.frontendUrl}/auth/callback` };
  }

  /**
   * 로그인 직후: RefreshTokenGuard가 검증한 refresh token을 Token 테이블에서 조회한 뒤 새 access token 발급.
   * refresh token은 그대로 유지
   */
  @Transactional()
  async issueAccessToken(): Promise<{ accessToken: string }> {
    const token = await this.findTokenInContext();

    token.accessToken = await this.tokenProvider.createAccessToken(token.id);
    await this.tokenRepository.save(token);
    return { accessToken: token.accessToken };
  }

  /**
   * access token 만료 시 재발급 (refresh token rotation).
   * Token 테이블 조회 (없으면 401) → 기존 Token 삭제 → access/refresh token 새로 발급해서 저장
   * → refresh token cookie 교체
   */
  @Transactional()
  async reissueTokens(): Promise<{ accessToken: string }> {
    const token = await this.findTokenInContext();

    await this.tokenRepository.delete({ id: token.id });

    const accessToken = await this.tokenProvider.createAccessToken(token.id);
    const refreshToken = await this.tokenProvider.createRefreshToken(token.id);
    await this.tokenRepository.save(
      this.tokenRepository.create({
        id: token.id,
        user: { id: token.id },
        accessToken,
        refreshToken,
      }),
    );
    this.refreshTokenContext.setRefreshTokenCookie(refreshToken);
    return { accessToken };
  }

  /** context의 refresh token으로 Token을 조회. 없거나 sub와 사용자가 다르면 401 */
  private async findTokenInContext(): Promise<Token> {
    const refreshToken = this.refreshTokenContext.getRefreshToken();
    const sub = this.refreshTokenContext.getSub();

    const token = await this.tokenRepository.findOne({
      where: { refreshToken },
    });
    if (!token || token.id !== sub) {
      throw new UnauthorizedException('등록되지 않은 refresh token입니다.');
    }
    return token;
  }
}
