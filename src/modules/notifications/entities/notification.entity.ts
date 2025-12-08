import { User } from "@/modules/users/entities/user.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

export enum NotificationTag {
  deposit = "deposit",
  wallet_credit = "wallet_credit",
}
@Entity({ name: "notifications" })
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  message: string;

  @Column({ nullable: true })
  tag: string;

  @Column({ type: "json", nullable: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any;

  @Column({ default: false })
  is_read: boolean;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @ManyToOne(() => User, (relationship) => relationship.notifications)
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column()
  user_id: number;
}
