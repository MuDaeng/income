import {BaseTimeEntity} from "../base/base-time.entity.js";
import {Column, Entity, PrimaryColumn} from "typeorm";
import {ClientType} from "@app/common/client/client-type.enum.js";

@Entity()
export class ClientToken extends BaseTimeEntity{
    @PrimaryColumn({ type: 'enum', enum: ClientType})
    clientType: ClientType;

    @Column({ type: 'text' })
    token: string;
}