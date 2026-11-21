import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account, User } from '@app/common';
import { AccountReader } from './account.reader.js';
import { AccountWriter } from './account.writer.js';
import { AccountController } from './restapi/account.controller.js';
import { AccountService } from './restapi/account.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Account, User])],
  controllers: [AccountController],
  providers: [AccountService, AccountReader, AccountWriter],
  exports: [AccountReader, AccountWriter],
})
export class UserModule {}
