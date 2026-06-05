import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Administrator } from "../../administrator/entities/administrator.entity";
import { WithdrawalWallet } from "./withdrawal-wallet.entity";

@Entity({ name: "withdrawals" })
export class Withdrawal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "double precision" })
  amount: number;

  @ManyToOne(() => WithdrawalWallet, (wallet) => wallet.id)
  @JoinColumn({ name: "withdrawal_wallet_id" })
  withdrawalWallet: WithdrawalWallet;

  @Column()
  withdrawal_wallet_id: number;

  @ManyToOne(() => Administrator, (admin) => admin.id)
  @JoinColumn({ name: "admin_id" })
  admin: Administrator;

  @Column()
  admin_id: number;

  @Column()
  transaction_hash?: string;

  @Column("json", { nullable: true })
  metadata: any;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;
}
