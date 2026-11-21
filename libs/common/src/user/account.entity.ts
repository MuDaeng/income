import {BaseTimeEntity} from "../base/base-time.entity.js";
import {Column, Entity, JoinColumn, ManyToOne, PrimaryColumn} from "typeorm";
import {AccountType} from "./account-type.enum.js";
import {SecurityCompany} from "./security-company.enum.js";
import {User} from "./user.entity.js";

@Entity()
export class Account extends BaseTimeEntity {
    @PrimaryColumn()
    userId: number;

    @PrimaryColumn ()
    id: number;

    @Column({ type: 'enum', enum: SecurityCompany })
    securityCompany: SecurityCompany;

    @Column({type: 'enum', enum: AccountType})
    accountType: AccountType;

    @ManyToOne(() => User, {onDelete: 'CASCADE'})
    @JoinColumn({name: 'userId'})
    user :User;
}