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
import { User } from "../users/entities/user.entity";
import { ExchangeRate } from "../exchange-rates/exchange-rates.entity";

export enum Status {
  active = "active",
  disabled = "disabled",
}

export enum TransactionModeType {
  credit = "credit",
  debit = "debit",
}

export enum TokenType {
  email_verification = "email_verification",
  forgot_password = "forgot_password",
}

export enum TransactionEntityType {
  deposit = "deposit",
  withdrawal = "withdrawal",
  transfer = "transfer",
  bill = "bill",
}
export enum TransactionStatusType {
  success = "success",
  failed = "failed",
  processing = "processing",
}

@Entity({ name: "transactions" })
export class Transactions {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (relationship) => relationship.id)
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column()
  user_id: number;

  @Column("double precision", { default: 0, nullable: true })
  amount: number;

  @Column("double precision", { default: 0, nullable: true })
  dollar_amount: number;

  @Column("double precision", { default: 0, nullable: true })
  coin_exchange_rate: number;

  @ManyToOne(() => ExchangeRate, (exchangeRate) => exchangeRate.id, {
    nullable: true,
  })
  @JoinColumn({ name: "exchange_rate_id" })
  exchange_rate: ExchangeRate;

  @Column({ nullable: true })
  exchange_rate_id: number;

  @Column("double precision", { default: 0 })
  coin_amount: number;

  @Column({ nullable: true })
  network: string;

  @Column({ nullable: true })
  currency: string;

  @Column({ nullable: true })
  wallet_address: string;

  @Column({ type: "varchar", default: TransactionStatusType.success })
  status: TransactionStatusType;

  @Column({ nullable: true })
  masamasa_ref: string;

  @Column({ nullable: true })
  session_id: string;

  @Column({ type: "enum", enum: TransactionModeType })
  mode: TransactionModeType;

  @Column("varchar")
  entity_type: TransactionEntityType;

  @Column("varchar")
  entity_id: number | string;

  @Column("json", { nullable: true })
  metadata?: any;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;
}
