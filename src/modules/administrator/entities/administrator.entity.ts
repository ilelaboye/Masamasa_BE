import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { AdminLogs } from "./admin-logs.entity";

export enum AdministratorRoles {
  admin = "admin",
  system_admin = "system_admin",
  super_admin = "super_admin",
}

export enum AdminStatus {
  active = "active",
  suspend = "suspend",
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

  @Column({ nullable: true })
  address: string;

  @Column({ select: false })
  password?: string;

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
