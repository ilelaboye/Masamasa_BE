import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Generated,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "@/modules/users/entities/user.entity";
import { Administrator } from "@/modules/administrator/entities/administrator.entity";

export enum AffiliateStatus {
  active = "active",
  disabled = "disabled",
}

@Entity({ name: "affiliates" })
export class Affiliate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "uuid", unique: true })
  @Generated("uuid")
  uuid: string;

  @ManyToOne(() => User, (user) => user.id, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column()
  user_id: number;

  @ManyToOne(() => Administrator, (admin) => admin.id, {
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "admin_id" })
  admin?: Administrator | null;

  @Column({ type: "integer", nullable: true, select: false })
  admin_id?: number | null;

  @Column({ type: "varchar", default: AffiliateStatus.active })
  status: AffiliateStatus;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamp", nullable: true })
  deleted_at?: Date | null;
}
