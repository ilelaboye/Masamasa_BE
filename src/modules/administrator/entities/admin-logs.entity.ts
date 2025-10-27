import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Administrator } from "./administrator.entity";
import { User } from "@/modules/users/entities/user.entity";

export enum AdminLogEntities {
  ENTITY_PAYEE = "ENTITY_PAYEE",
  ENTITY_PREFERENCE = "ENTITY_PREFERENCE",
  ENTITY_PERMISSION = "ENTITY_PERMISSION",
  ENTITY_PAYMENT_REQUESTS = "ENTITY_PAYMENT_REQUESTS",
  ENTITY_BUDGET_CATEGORY = "ENTITY_BUDGET_CATEGORY",
  ENTITY_ORGANIZATION = "ENTITY_ORGANIZATION",
  ENTITY_DOCUMENTS_TYPE = "ENTITY_DOCUMENTS_TYPE",
}

@Entity({ name: "admin_logs" })
export class AdminLogs {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  entity: string;

  @Column("text", { nullable: true })
  note: string;

  @ManyToOne(() => User, (user) => user.id, { nullable: true })
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ nullable: true })
  user_id?: number;

  @ManyToOne(() => Administrator, (admin) => admin.logs, { nullable: false })
  @JoinColumn({ name: "admin_id" })
  admin: Administrator;

  @Column()
  admin_id: string;

  @Column({ default: false })
  visible: boolean;

  @Column("json", { nullable: true })
  metadata: any;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;
}
