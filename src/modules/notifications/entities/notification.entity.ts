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
  login = "login",
  security = "security",
  withdrawal = "withdrawal",
  // Paid out when someone you referred crosses the qualifying deposit. Kept
  // apart from wallet_credit so the reward itself is distinguishable in the
  // list from the later transfer of those earnings into the main balance.
  // `tag` is a varchar rather than a DB enum, so a new member needs no migration.
  referral_bonus = "referral_bonus",
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
