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

    @Column({ type: 'date'})
    noticeDate: string;

    @Column(decimalColumn)
    amount: string;

    @Column({ type: 'enum', enum: DividendType })
    type: DividendType;

    @ManyToOne(() => Security, {onDelete: 'CASCADE'})
    @JoinColumn({name: 'id'})
    security: Security;
}