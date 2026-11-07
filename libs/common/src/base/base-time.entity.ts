import {CreateDateColumn, UpdateDateColumn} from "typeorm";

export abstract class BaseTimeEntity {
    @CreateDateColumn({type: 'timestamp', comment: '생성일'})
    createdAt: Date;

    @UpdateDateColumn({type: 'timestamp', comment: '수정일'})
    updatedAt: Date;
}