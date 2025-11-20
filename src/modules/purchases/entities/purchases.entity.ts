import { User } from "@/modules/users/entities/user.entity";
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum PurchaseType {
  airtime = "airtime",
  electricity_bill = "electricity_bill",
  tv_subscription = "tv_subscription",
  data = "data",
}

export enum PurchaseMerchants {
  vtpass = "vtpass",
  mobileniger = "mobileniger",
}

export enum PurchaseStatus {
  draft = "draft",
  pending = "pending",

  processed = "processed",
  paid = "paid",

  processing = "processing",
  canceled = "canceled",
  declined = "declined",
  failed = "failed",
}

@Entity("purchases")
export class PurchaseRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.id, { nullable: false })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column()
  user_id: number;

  @Column("decimal", { default: 0 })
  amount: number;

  @Column("decimal", { default: 0 })
  total: number;

  @Column("decimal", { default: 0, select: false })
  commission: number;

  @Column({ nullable: true })
  country?: string;

  @Column({
    type: "varchar",
    default: PurchaseStatus.pending,
  })
  status: PurchaseStatus;

  @Column({ type: "varchar", nullable: true })
  provider?: string;

  @Column({ type: "decimal", nullable: true })
  fee?: number;

  @Column({ type: "varchar" })
  type: PurchaseType;

  @Column({ nullable: true, unique: true })
  masamasa_ref: string;

  @Column("varchar", { nullable: true })
  other_ref?: string;

  @Column({ type: "text", nullable: true })
  recipient_name: string;

  @Column({ type: "json", nullable: true })
  metadata: any;

  @Column({ type: "json", nullable: true })
  others?: any;

  @DeleteDateColumn({ type: "timestamp", nullable: true })
  deleted_at?: Date | null;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;
}
