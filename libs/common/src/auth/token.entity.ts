import {Entity, PrimaryColumn} from "typeorm";
import {BaseTimeEntity} from "../base/base-time.entity.js";

@Entity()
export class Token extends BaseTimeEntity{
    @PrimaryColumn()
    accessToken: string;
    @PrimaryColumn()
    refreshToken: string;
}