import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn, 
  CreateDateColumn, 
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn
} from "typeorm";
import { User } from "@/modules/users/entities/user.entity";

export enum DisposableWalletStatus {
  PENDING = "pending",
  FUNDED = "funded",
  SWEPT = "swept",
  EXPIRED = "expired",
  FAILED = "failed"
}

@Entity("disposable_wallets")
export class DisposableWallet {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ nullable: true })
  user_id?: number;

  @Index()
  @Column({ unique: true })
  address: string;

  @Column()
  network: string;

  @Column({ nullable: true })
  token_symbol?: string;

  @Column({ type: "integer", nullable: true })
  destination_tag?: number;

  @Column({ type: "integer" })
  derivation_index: number;

  @Column({ type: "decimal", precision: 36, scale: 18, nullable: true })
  expected_amount?: number;

  @Column({ type: "decimal", precision: 36, scale: 18, default: 0 })
  received_amount: number;

  @Column({
    type: "enum",
    enum: DisposableWalletStatus,
    default: DisposableWalletStatus.PENDING
  })
  status: DisposableWalletStatus;

  @Column({ type: "timestamp" })
  expires_at: Date;

  @Column({ nullable: true })
  sweep_tx_hash?: string;

  @Column({ type: "jsonb", nullable: true })
  metadata?: Record<string, any>;

  @Column({ nullable: true })
  funding_tx_hash?: string;

  @Column({ type: "timestamp", nullable: true })
  funded_at?: Date;

  @Column({ type: "timestamp", nullable: true })
  swept_at?: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
