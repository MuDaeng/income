import {Column, Entity, JoinColumn, ManyToOne, PrimaryColumn} from "typeorm";
import { BaseTimeEntity } from "../base/base-time.entity.js";
import { decimalColumn } from "../base/decimal-column.js";
import {UserBalance} from "./user-balance.entity.js";
import {SecurityCompany} from "./security-company.enum.js";

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

    @Column({ type: 'enum', enum: SecurityCompany })
    securityCompany: SecurityCompany;

    @Column(decimalColumn)
    amount: string;

    @Column(decimalColumn)
    price: string;

    /** 'YYYY-MM-DD', 매도 전이면 null */
    @Column({ type: 'date', nullable: true })
    saleDate: string | null;

    /** 구매 환율(1 USD당 원화, 소수 6자리 버림). KRW 종목이거나 환율을 모르면 null → 조회 시 매수일 환율로 대체 */
    @Column({ ...decimalColumn, nullable: true })
    exchangeRate: string | null;

    @ManyToOne(() => UserBalance, {onDelete: 'CASCADE'})
    @JoinColumn([
        {name: 'userId', referencedColumnName: 'userId'},
        {name: 'securityId', referencedColumnName: 'securityId'},
    ])
    userBalance: UserBalance;
}