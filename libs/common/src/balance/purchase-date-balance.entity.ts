import {Column, Entity, JoinColumn, ManyToOne, PrimaryColumn} from "typeorm";
import { BaseTimeEntity } from "../base/base-time.entity.js";
import { decimalColumn } from "../base/decimal-column.js";
import {UserBalance} from "@app/common/balance/user-balance.entity.js";

@Entity()
export class PurchaseDateBalance extends BaseTimeEntity{
    @PrimaryColumn()
    userId: number;

    @PrimaryColumn()
    securityId: string;

    /** 'YYYY-MM-DD' */
    @PrimaryColumn({ type: 'date' })
    purchaseDate: string;

    @PrimaryColumn()
    sequence: number;

    @Column(decimalColumn)
    amount: string;

    @Column(decimalColumn)
    price: string;

    @ManyToOne(() => UserBalance, {onDelete: 'CASCADE'})
    @JoinColumn([
        {name: 'userId', referencedColumnName: 'userId'},
        {name: 'securityId', referencedColumnName: 'securityId'},
    ])
    userBalance: UserBalance;
}