import {BaseTimeEntity} from "../base/base-time.entity.js";
import {Column, Entity, PrimaryColumn} from "typeorm";
import {decimalColumn} from "../base/decimal-column.js";
import {Currency} from "./currency.enum.js";

@Entity()
export class DailyExchangeRate extends BaseTimeEntity {
    @PrimaryColumn({ type: 'date' })
    date: string;

    @PrimaryColumn({ type: 'enum', enum: Currency})
    currency: Currency;

    @Column(decimalColumn)
    openingRate: string;

    @Column(decimalColumn)
    closingRate: string;

    @Column(decimalColumn)
    highestRate: string;

    @Column(decimalColumn)
    lowestRate: string;
}