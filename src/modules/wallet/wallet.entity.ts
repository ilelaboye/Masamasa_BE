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

export enum Status {
  active = "active",
  disabled = "disabled",
}

export enum WalletType {
  quidax = "quidax",
  self_custodian = "self_custodian",
}

export enum TokenType {
  email_verification = "email_verification",
  forgot_password = "forgot_password",
}

@Entity({ name: "wallet" })
export class Wallet {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (relationship) => relationship.id)
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column()
  user_id: number;

  @Column()
  network: string;

  @Column({ nullable: true })
  currency: string;

  @Column({ nullable: false })
  wallet_address: string;

  @Column({
    type: "varchar",
    default: Status.active,
  })
  status: Status;

  @Column({
    type: "varchar",
    default: WalletType.self_custodian,
  })
  type: WalletType;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;
}
