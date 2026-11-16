import {Entity, JoinColumn, ManyToOne, PrimaryColumn} from "typeorm";
import {Rule} from "./rule.enum.js";
import {User} from "./user.entity.js";

@Entity()
export class UserRule {
    @PrimaryColumn()
    id: number;

    @PrimaryColumn({type: 'enum', enum: Rule})
    rule: Rule;

    @ManyToOne(() => User, {onDelete: 'CASCADE'})
    @JoinColumn({name: 'id'})
    user: User;
}