import {Column, Entity, JoinColumn, ManyToOne, PrimaryColumn} from "typeorm";
import {BaseTimeEntity} from "../base/base-time.entity.js";
import {decimalColumn} from "../base/decimal-column.js";
import {Security} from "../security/security.entity.js";
import {DividendType} from "../security/dividend-type.enum.js";

@Entity()
export class Dividend extends BaseTimeEntity {
    @PrimaryColumn()
    id: string;

    @PrimaryColumn({ type: 'date'})
    paymentDate: string;

    /** 배당 기준일(record date) */
    @Column({ type: 'date'})
    noticeDate: string;

    /**
     * 배당락일(ex-dividend date). 이 날 전날까지 매수하고, 이 날 이후(당일 포함) 매도해야 배당을 받는다.
     * 컬럼 추가 전에 저장한 행은 null (그때는 기준일 보유로 판정)
     */
    @Column({ type: 'date', nullable: true })
    exDividendDate: string | null;

    @Column(decimalColumn)
    amount: string;

    @Column({ type: 'enum', enum: DividendType })
    type: DividendType;

    @ManyToOne(() => Security, {onDelete: 'CASCADE'})
    @JoinColumn({name: 'id'})
    security: Security;
}