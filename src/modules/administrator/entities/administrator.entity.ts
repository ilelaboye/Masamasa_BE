import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { AdminLogs } from "./admin-logs.entity";

export enum AdministratorRoles {
  super_admin = "super_admin",
  marketer = "marketer",
}

export enum AdminStatus {
  active = "active",
  suspend = "suspend",
  pending = "pending",
}

@Entity({ name: "administrators" })
export class Administrator {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  first_name: string;

  @Column()
  last_name: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({
    type: "enum",
    enum: AdminStatus,
    default: AdminStatus.active,
  })
  status: AdminStatus;

  @Column({
    type: "enum",
    enum: AdministratorRoles,
    default: AdministratorRoles.super_admin,
  })
  role: AdministratorRoles;

  @Column({ nullable: true })
  address: string;

  // Null until an invited staff member completes registration. The explicit
  // type is required — TypeORM cannot infer a column type from a union.
  @Column({ type: "varchar", select: false, nullable: true })
  password?: string | null;

  @Column({ type: "varchar", select: false, nullable: true })
  invite_token?: string | null;

  // the 48-hour expiry is measured from here, and resending an invite resets it.
  @Column({ type: "timestamp", nullable: true })
  invite_sent_at?: Date | null;

  @OneToMany(() => AdminLogs, (logs) => logs.admin)
  logs: AdminLogs[];

  @Column({ type: "timestamp", nullable: true })
  last_seen: Date | null;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamp" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamp", nullable: true, select: false })
  deleted_at?: Date | null;
}
