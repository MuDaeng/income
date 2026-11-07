import { Module } from '@nestjs/common';
import {ConfigModule} from "@nestjs/config";
import {authConfig} from "./config/auth.config.js";

@Module({
  imports: [ConfigModule.forRoot({isGlobal: true, load: [authConfig]})],
  providers: [],
  exports: [],
})
export class CommonModule {}
