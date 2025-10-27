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
import { Administrator } from "../administrator/entities/administrator.entity";

export enum ExchangeRateStatus {
  active = "active",
  disabled = "disabled",
}

@Entity({ name: "exchange_rates" })
export class ExchangeRate {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Administrator, (admin) => admin.id)
  @JoinColumn({ name: "admin_id" })
  admin: User;

  @Column()
  admin_id: number;

  @Column("double precision", { default: 1 })
  rate: number;

  @Column({ type: "enum", enum: ExchangeRateStatus })
  status: ExchangeRateStatus;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;
}
