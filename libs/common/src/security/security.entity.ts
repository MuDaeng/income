import {Column, Entity, PrimaryColumn} from "typeorm";
import {BaseTimeEntity} from "../base/base-time.entity.js";
import {SecurityType} from "./security-type.enum.js";
import {Currency} from "./currency.enum.js";

@Entity()
export class Security extends BaseTimeEntity {
    @PrimaryColumn()
    id: string;

    @Column({type: 'enum', enum: SecurityType})
    type: SecurityType;

    @Column()
    symbol: string;

    @Column()
    name: string;

    @Column()
    shortenedName: string;

    @Column({type: 'enum', enum: Currency})
    currency: Currency;
}