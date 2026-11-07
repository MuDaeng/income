import {Entity, PrimaryColumn, ManyToOne, Column, JoinColumn} from "typeorm";
import {OAuthType} from "./oauth-type.enum.js";
import {User} from "./user.entity.js";
import {BaseTimeEntity} from "../base/base-time.entity.js";


@Entity()
export class Oauth extends BaseTimeEntity {
    @PrimaryColumn()
    id: number;

    @PrimaryColumn({type: 'enum', enum: OAuthType})
    type: OAuthType;

    @Column()
    name: string;

    @ManyToOne(() => User, {onDelete: 'CASCADE'})
    @JoinColumn({name: 'id'})
    user: User;
}
