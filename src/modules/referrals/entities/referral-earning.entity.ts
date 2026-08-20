import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../../users/entities/user.entity";

/**
 * One reward, owed to `user` because `referee` — someone who signed up with
 * `user`'s referral code — crossed the qualifying deposit threshold.
 *
 * The row is the reward: the user's "earning account" balance is the sum of
 * their un-withdrawn rows, and withdrawing flips those rows while crediting
 * the same total to their main balance as a transaction. There is no separate
 * balance column anywhere, so the two can never disagree.
 */
@Entity({ name: "referral_earnings" })
// Enforces the one-time payout. Relying on a service-level "already paid?"
// read would let two deposits confirming at the same moment both insert.
@Unique("UQ_referral_earnings_user_referee", ["user_id", "referee_id"])
@Index("IDX_referral_earnings_user_status", ["user_id", "withdrawal_status"])
export class ReferralEarning {
  @PrimaryGeneratedColumn()
  id: number;

  /** The referrer — the account the reward is paid to. */
  @ManyToOne(() => User, (user) => user.id, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column()
  user_id: number;

  /** The person who was referred and whose deposits triggered the reward. */
  @ManyToOne(() => User, (user) => user.id, { onDelete: "CASCADE" })
  @JoinColumn({ name: "referee_id" })
  referee: User;

  @Column()
  referee_id: number;

  /**
   * NGN. Snapshotted at award time so a later change to the reward figure does
   * not silently restate what someone already earned.
   */
  @Column("double precision", { default: 0 })
  amount: number;

  /**
   * true  — already moved into the user's main balance.
   * false — still sitting in the earning account, available to withdraw.
   */
  @Column({ type: "boolean", default: false })
  withdrawal_status: boolean;

  /** When [withdrawal_status] was set — null while the reward is unclaimed. */
  @Column({ type: "timestamp", nullable: true })
  withdrawn_at: Date | null;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;
}
