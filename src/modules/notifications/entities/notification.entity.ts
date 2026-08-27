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

/**
 *   sent      — delivered; every immediate notification is created this way
 *   pending   — scheduled, waiting for the cron to release it
 *   cancelled — an admin called the broadcast off before it went out
 *
 * `status` is a varchar rather than a DB enum, so a new member needs no
 * migration.
 */
export enum NotificationStatus {
  sent = "sent",
  pending = "pending",
  cancelled = "cancelled",
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

  // NULL for an immediate notification. Set to the hour a scheduled broadcast
  // should reach the user; the cron releases it during that hour.
  @Column({ type: "timestamptz", nullable: true })
  scheduled_for?: Date | null;

  @Column({ type: "varchar", default: NotificationStatus.sent })
  status: NotificationStatus;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @ManyToOne(() => User, (relationship) => relationship.notifications)
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column()
  user_id: number;
}
