import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

export enum WebhookEntityType {
  deposit = "deposit",
  // Idempotency marker — one row per processed Quidax webhook event
  quidax_event = "quidax_event",
}

@Entity({ name: "webhooks" })
export class Webhook {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, nullable: true })
  hash?: string;

  @Column("varchar")
  entity_type: WebhookEntityType;

  @Column({ nullable: true })
  address: string;

  @Column("json")
  metadata?: any;

  @CreateDateColumn({ type: "timestamp" })
  created_at!: Date;
}
