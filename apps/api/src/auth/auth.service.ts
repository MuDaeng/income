import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { authConfig, Oauth, OAuthType, Token, User } from '@app/common';
import type { AuthUser } from './jwt.strategy.js';
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
   * OAuth 로그인 성공 시 access/refresh token 발급 후 Token 테이블에 새 행으로 저장
   * (기기마다 1행이라 다른 기기의 로그인은 유지됨), refresh token을 cookie에 설정하고 프론트엔드 callback 주소를 반환.
   * 로그아웃 API가 없어 버려진 세션이 쌓이므로, 이 사용자의 행 중 refresh token 만료 기간 동안 갱신되지 않은 행은 지운다
   */
  @Transactional()
  async loginWithOauth(user: User): Promise<{ url: string }> {
    await this.tokenRepository.delete({
      userId: user.id,
      updatedAt: LessThan(
        new Date(Date.now() - this.auth.jwtRefreshExpiresIn * 1000),
      ),
    });

    const accessToken = await this.tokenProvider.createAccessToken(user.id);
    const refreshToken = await this.tokenProvider.createRefreshToken(user.id);
    await this.tokenRepository.save(
      this.tokenRepository.create({
        userId: user.id,
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

    token.accessToken = await this.tokenProvider.createAccessToken(token.userId);
    await this.tokenRepository.save(token);
    return { accessToken: token.accessToken };
  }

  /**
   * access token 만료 시 재발급 (refresh token rotation).
   * Token 테이블 조회 (없으면 401) → 그 세션(기기)의 행만 새 access/refresh token으로 교체
   * → refresh token cookie 교체. 이전 refresh token은 더 이상 테이블에 없어 쓸 수 없고, 다른 기기의 행은 그대로
   */
  @Transactional()
  async reissueTokens(): Promise<{ accessToken: string }> {
    const token = await this.findTokenInContext();

    token.accessToken = await this.tokenProvider.createAccessToken(token.userId);
    token.refreshToken = await this.tokenProvider.createRefreshToken(token.userId);
    await this.tokenRepository.save(token);
    this.refreshTokenContext.setRefreshTokenCookie(token.refreshToken);
    return { accessToken: token.accessToken };
  }

  /** Bearer access token의 사용자를 DB에서 조회. 삭제된 사용자면 401 */
  async getMe(authUser: AuthUser): Promise<User> {
    const user = await this.userRepository.findOneBy({ id: authUser.id });
    if (!user) {
      throw new UnauthorizedException('존재하지 않는 사용자입니다.');
    }
    return user;
  }

  /** context의 refresh token으로 Token을 조회. 없거나 sub와 사용자가 다르면 401 */
  private async findTokenInContext(): Promise<Token> {
    const refreshToken = this.refreshTokenContext.getRefreshToken();
    const sub = this.refreshTokenContext.getSub();

    const token = await this.tokenRepository.findOne({
      where: { refreshToken },
    });
    if (!token || token.userId !== sub) {
      throw new UnauthorizedException('등록되지 않은 refresh token입니다.');
    }
    return token;
  }
}
