import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { Oauth, OAuthType, User } from '@app/common';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Oauth)
    private readonly oauthRepository: Repository<Oauth>,
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
}
