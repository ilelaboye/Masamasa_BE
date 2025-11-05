import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../users/entities/user.entity";
@Entity({ name: "transfers" })
export class Transfer {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (relationship) => relationship.id)
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column()
  user_id: number;

  @ManyToOne(() => User, (relationship) => relationship.id)
  @JoinColumn({ name: "receiver_id" })
  receiver: User;

  @Column()
  receiver_id: number;

  @Column("double precision", { default: 0 })
  amount: number;

  @CreateDateColumn({ type: "timestamp" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at: Date;
}
