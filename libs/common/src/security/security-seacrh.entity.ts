import {BaseTimeEntity} from "../base/base-time.entity.js";
import {Column, Entity, PrimaryColumn} from "typeorm";

@Entity()
export class SecuritySearch extends BaseTimeEntity {
    @PrimaryColumn()
    id: string;

    @Column({type: 'date'})
    lastSearchDate: string;
}