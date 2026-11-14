import {Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn} from "typeorm";
import {BaseTimeEntity} from "../base/base-time.entity.js";
import {User} from "../user/user.entity.js";

/**
 * 로그인 세션(기기)당 1행. 한 사용자가 여러 기기(PC·휴대폰)에서 동시에 로그인할 수 있도록
 * 로그인할 때마다 행을 추가하고, 재발급은 그 행만 교체한다
 */
@Entity()
export class Token extends BaseTimeEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    userId: number;

    @ManyToOne(() => User, {onDelete: 'CASCADE'})
    @JoinColumn({name: 'userId'})
    user: User;

    @Column({type: 'varchar', length: 512})
    accessToken: string;

    @Index({unique: true})
    @Column({type: 'varchar', length: 512})
    refreshToken: string;
}
