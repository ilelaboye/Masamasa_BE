/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

export enum BankVerificationType {
  "bvn" = "bvn",
  "other" = "other",
  "accountNumber" = "accountNumber",
}

@Entity("bank_verifications")
export class BankVerification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "enum", enum: BankVerificationType })
  type: BankVerificationType;

  @Column()
  value: string;

  @Column({ nullable: true })
  hashed_value?: string;

  @Column("json", { nullable: true })
  metadata: any;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;
}
