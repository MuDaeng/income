import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Oauth, OAuthType, User } from '@app/common';

@Injectable()
export class ApiService {
  constructor(private readonly dataSource: DataSource) {}

  async getHello(): Promise<string> {
    await this.dataSource.transaction(async (manager) => {
      const user = await manager.save(manager.create(User));

      const oauth = manager.create(Oauth, {
        user,
        type: OAuthType.GOOGLE,
        name: 'test@google.com',
      });
      await manager.save(oauth);
    });
    return 'Hello World!';
  }
}
