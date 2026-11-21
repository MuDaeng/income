import {BaseTimeEntity} from "../base/base-time.entity.js";
import {Entity, JoinColumn, ManyToOne, PrimaryColumn} from "typeorm";
import {Security} from "../security/index.js";
import {User} from "../user/index.js";
import {Account} from "../user/account.entity.js";

@Entity()
export class UserBalance extends BaseTimeEntity{
    @PrimaryColumn()
    userId: number;

    @PrimaryColumn({ default: 1 })
    accountId: number;

    @PrimaryColumn()
    securityId: string;

    @ManyToOne(() => User, {onDelete: 'CASCADE'})
    @JoinColumn({name: 'userId'})
    user: User;

    @ManyToOne(() => Account, {onDelete: 'CASCADE'})
    @JoinColumn([{name:'userId', referencedColumnName: 'userId'},{name: 'accountId', referencedColumnName: 'id'}])
    account: Account;

    @ManyToOne(() => Security, {onDelete: 'CASCADE'})
    @JoinColumn({name: 'securityId'})
    security: Security;
}