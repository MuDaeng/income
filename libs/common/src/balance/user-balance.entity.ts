import {BaseTimeEntity} from "../base/base-time.entity.js";
import {Entity, JoinColumn, ManyToOne, PrimaryColumn} from "typeorm";
import {Security} from "../security/index.js";

@Entity()
export class UserBalance extends BaseTimeEntity{
    @PrimaryColumn()
    userId: number;

    @PrimaryColumn({ default: 1 })
    accountId: number;

    @PrimaryColumn()
    securityId: string;

    @ManyToOne(() => Security, {onDelete: 'CASCADE'})
    @JoinColumn({name: 'securityId'})
    security: Security;
}