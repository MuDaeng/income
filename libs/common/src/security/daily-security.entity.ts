import {BaseTimeEntity} from "../base/base-time.entity.js";
import {decimalColumn} from "../base/decimal-column.js";
import {Column, Entity, JoinColumn, ManyToOne, PrimaryColumn} from "typeorm";
import {Security} from "./security.entity.js";

@Entity()
export class DailySecurity extends BaseTimeEntity {
    @PrimaryColumn()
    id: string;

    @PrimaryColumn({ type: 'date' })
    date: string;

    @Column(decimalColumn)
    openingPrice: number;

    @Column(decimalColumn)
    closingPrice: number;

    @Column(decimalColumn)
    highestPrice: number;

    @Column(decimalColumn)
    lowestPrice: number;

    @ManyToOne(() => Security, {onDelete: 'CASCADE'})
    @JoinColumn({name: 'id'})
    security: Security;
}