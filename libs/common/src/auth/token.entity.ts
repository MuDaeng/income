import {Column, Entity, Index, JoinColumn, OneToOne, PrimaryColumn} from "typeorm";
import {BaseTimeEntity} from "../base/base-time.entity.js";
import {User} from "../user/user.entity.js";

/** 사용자당 1행. 다시 로그인하면 토큰이 교체됨 */
@Entity()
export class Token extends BaseTimeEntity {
    @PrimaryColumn()
    id: number;

    @OneToOne(() => User, {onDelete: 'CASCADE'})
    @JoinColumn({name: 'id'})
    user: User;

    @Column({type: 'varchar', length: 512})
    accessToken: string;

    @Index({unique: true})
    @Column({type: 'varchar', length: 512})
    refreshToken: string;
}
