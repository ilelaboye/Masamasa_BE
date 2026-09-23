import { WITHDRAWAL_MAX_UNVERIFIED } from "@/constants";
import { Notification } from "@/modules/notifications/entities/notification.entity";
import { Wallet } from "@/modules/wallet/wallet.entity";
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum Status {
  active = "active",
  pending = "pending",
  archived = "archived",
  deactivated = "deactivated",
}

export enum KycStatus {
  success = "success",
  pending = "pending",
  failed = "failed",
  none = "none",
}

export enum TokenType {
  email_verification = "email_verification",
  forgot_password = "forgot_password",
}

@Entity({ name: "users" })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  first_name: string;

  @Column()
  last_name: string;

  @Column({
    type: "varchar",
    default: Status.active,
  })
  status: Status;

  @Column({ default: false })
  mfa: boolean;

  @Column({
    type: "varchar",
    default: KycStatus.none,
  })
  kyc_status: KycStatus;

  @Column({ nullable: true })
  kyc_image?: string;

  /** Why the last submission was rejected. Cleared on a fresh attempt. */
  @Column({ type: "varchar", nullable: true })
  kyc_error?: string | null;

  @Column({ nullable: true })
  profile_image?: string;

  @Column({ nullable: true })
  kyc_type?: string;

  /** Back of the ID document, where the type has one. */
  @Column({ nullable: true })
  kyc_image_back?: string;

  /** The selfie taken during the KYC flow. */
  @Column({ nullable: true })
  kyc_selfie?: string;

  /**
   * Verification tier reached. 1 is every registered account; 2 is identity
   * verified; 3 (address verified) is not built yet. The tier is what the user
   * is shown — `withdrawal_limit` is what a withdrawal is actually held to,
   * because an admin can adjust that per account.
   */
  @Column({ type: "smallint", default: 1 })
  kyc_tier: number;

  @Column({ unique: true })
  email: string;

  @Column({ select: false, nullable: true })
  password?: string;

  @Column({ select: false, nullable: true })
  google_id?: string;

  @Column({ select: false, nullable: true })
  pin?: string;

  @Column({ type: "varchar", nullable: true })
  phone?: string | null;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  country: string;

  /**
   * This user's own referral code — what they share with other people.
   * Unique across the table; generated at signup and backfilled for accounts
   * that predate the referral feature. Sized to 10 so the generated length
   * (7 today) can grow without a schema change.
   */
  @Column({ type: "varchar", length: 10, unique: true })
  referral_code: string;

  /**
   * The user whose referral code this account signed up with, or null for an
   * organic signup. Set once at registration and never changed — retroactive
   * attribution would let anyone claim rewards for existing users.
   */
  @ManyToOne(() => User, (user) => user.id, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "referred_by_id" })
  referred_by?: User;

  @Column({ nullable: true })
  referred_by_id?: number | null;

  /**
   * This account's own daily withdrawal ceiling, in NGN. Starts at
   * WITHDRAWAL_MAX_UNVERIFIED, is raised to WITHDRAWAL_MAX_PER_DAY the moment
   * KYC is approved, and an admin can set it to anything up to that maximum.
   *
   * pg hands back `numeric` as a string; the transformer parses it here so
   * every caller can do arithmetic on it without remembering to.
   */
  @Column({
    type: "numeric",
    precision: 20,
    scale: 2,
    default: WITHDRAWAL_MAX_UNVERIFIED,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  withdrawal_limit: number;

  @Column({ nullable: true })
  quidax_id?: string;

  @Column({ nullable: true })
  device_id: string;

  @Column({ nullable: true })
  notification_token: string;

  @Column({ nullable: true, type: "text", select: false })
  remember_token?: string | null;

  @Column({ type: "timestamp", nullable: true })
  email_verified_at?: Date | null;

  @Column({ type: "timestamp", nullable: true })
  token_created_at?: Date | null;

  // Updated (throttled) by the AuthGuard — powers daily-active-user stats
  @Column({ type: "timestamp", nullable: true })
  last_seen_at?: Date | null;

  @DeleteDateColumn({ type: "timestamp", nullable: true, select: false })
  deleted_at?: Date | null;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;

  @OneToMany(() => Notification, (r) => r.user)
  @JoinColumn({ name: "user_id" })
  notifications: Notification[];

  @OneToMany(() => Wallet, (wallet) => wallet.user)
  @JoinColumn({ name: "user_id" })
  wallet: Wallet;
}
