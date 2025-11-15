import { Notification } from "@/modules/notifications/entities/notification.entity";
import { Wallet } from "@/modules/wallet/wallet.entity";
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum Status {
  active = "active",
  pending = "pending",
  archived = "archived",
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

  @Column({
    type: "varchar",
    default: KycStatus.none,
  })
  kyc_status: KycStatus;

  @Column({ nullable: true })
  kyc_image?: string;

  @Column({ nullable: true })
  kyc_error?: string;

  @Column({ nullable: true })
  profile_image?: string;

  @Column({ nullable: true })
  kyc_type?: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false, nullable: true })
  password?: string;

  @Column({ select: false, nullable: true })
  pin?: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true, type: "text", select: false })
  remember_token?: string | null;

  @Column({ type: "timestamp", nullable: true })
  email_verified_at?: Date | null;

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
