import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Oauth, User } from '@app/common';
import { ApiController } from './api.controller.js';
import { ApiService } from './api.service.js';

describe('ApiController', () => {
  let apiController: ApiController;
  const manager = {
    create: vi.fn((_entity: unknown, data?: object) => ({ ...data })),
    save: vi.fn(async (entity: object) => ({ id: 1, ...entity })),
  };
  const dataSource = {
    transaction: vi.fn(async (work: (m: typeof manager) => Promise<void>) =>
      work(manager),
    ),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ApiController],
      providers: [ApiService, { provide: DataSource, useValue: dataSource }],
    }).compile();

    apiController = app.get<ApiController>(ApiController);
  });

  describe('root', () => {
    it('saves a user and its oauth in one transaction', async () => {
      await expect(apiController.getHello()).resolves.toBe('Hello World!');
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.create).toHaveBeenCalledWith(User);
      expect(manager.create).toHaveBeenCalledWith(
        Oauth,
        expect.objectContaining({ user: expect.objectContaining({ id: 1 }) }),
      );
      expect(manager.save).toHaveBeenCalledTimes(2);
    });
  });
});
