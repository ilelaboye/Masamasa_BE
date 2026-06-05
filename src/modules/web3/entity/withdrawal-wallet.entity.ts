import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { Administrator } from "../../administrator/entities/administrator.entity";

@Entity({ name: "withdrawal_wallets" })
@Unique(["coin", "network"])
export class WithdrawalWallet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  coin: string;

  @Column()
  network: string;

  @Column()
  address: string;

  @ManyToOne(() => Administrator, (admin) => admin.id)
  @JoinColumn({ name: "admin_id" })
  admin: Administrator;

  @Column()
  admin_id: number;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;
}
