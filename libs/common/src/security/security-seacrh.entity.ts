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

    /**
     * 지금까지 받아 둔 구간의 시작일. 이 날짜가 받아야 할 시작일 이전이면 최근 구간만 다시 받는다.
     * null(이 컬럼이 생기기 전 행)이면 전체 구간을 한 번 다시 받는다
     */
    @Column({type: 'date', nullable: true})
    fromDate: string | null;
}
