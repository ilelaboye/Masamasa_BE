/* eslint-disable @typescript-eslint/no-explicit-any */
import { User } from "@/modules/users/entities/user.entity";
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

export enum BankVerificationType {
  "bvn" = "bvn",
  "nin" = "nin",
  "passport" = "passport",
  "drivers_license" = "drivers_license",
  "voters_card" = "voters_card",
  // A photographed document, keyed by the number read off it.
  "other" = "other",
  "accountNumber" = "accountNumber",
}

@Entity("bank_verifications")
export class BankVerification {
  @PrimaryGeneratedColumn()
  id: number;

  // Stored as varchar rather than a pg enum: ID types are added as Prembly
  // supports more of them, and that should not need an ALTER TYPE every time.
  // Matches how `users.kyc_status` is stored.
  @Column({ type: "varchar" })
  type: BankVerificationType;

  @Column()
  value: string;

  @Column({ nullable: true })
  hashed_value?: string;

  @Column("json", { nullable: true })
  metadata: any;

  /**
   * The account this ID verified. Nullable: rows written before this column
   * existed have none, and the bank-account-number lookups that share this
   * table are not tied to a user.
   */
  @Column({ nullable: true })
  user_id?: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user?: User;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;
}
