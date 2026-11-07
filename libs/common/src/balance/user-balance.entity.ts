import {BaseTimeEntity} from "../base/base-time.entity.js";
import {Entity, JoinColumn, ManyToOne, PrimaryColumn} from "typeorm";
import {Security} from "../security/index.js";
import {User} from "../user/index.js";

@Entity()
export class UserBalance extends BaseTimeEntity{
    @PrimaryColumn()
    userId: number;

    @PrimaryColumn()
    securityId: string;

    @ManyToOne(() => User, {onDelete: 'CASCADE'})
    @JoinColumn({name: 'userId'})
    user: User;

    @ManyToOne(() => Security, {onDelete: 'CASCADE'})
    @JoinColumn({name: 'securityId'})
    security: Security;
}