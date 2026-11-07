import { Entity, PrimaryGeneratedColumn } from "typeorm";
import {BaseTimeEntity} from "../base/base-time.entity.js";

@Entity()
export class User extends BaseTimeEntity {
    @PrimaryGeneratedColumn()
    id: number;
}
