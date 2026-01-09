/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

export enum AccessTokenType {
  "nomba" = "nomba",
}

@Entity("access_tokens")
export class AccessToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar" })
  type: AccessTokenType;

  @Column()
  token: string;

  @Column({ nullable: true })
  refresh_token?: string;

  @Column("json", { nullable: true })
  metadata: any;

  @CreateDateColumn({ type: "timestamp" })
  created_at: Date;
}
