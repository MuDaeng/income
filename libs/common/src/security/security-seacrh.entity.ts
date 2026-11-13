import {BaseTimeEntity} from "../base/base-time.entity.js";
import {Column, Entity, PrimaryColumn} from "typeorm";
import {SearchType} from "./search-type.enum.js";

@Entity()
export class SecuritySearch extends BaseTimeEntity {
    @PrimaryColumn()
    id: string;

    @PrimaryColumn({type: 'enum', enum: SearchType, default: SearchType.INCOME})
    type: SearchType;

    @Column({type: 'date'})
    lastSearchDate: string;
}