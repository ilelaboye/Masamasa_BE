import { User } from "@/modules/users/entities/user.entity";
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("beneficiaries")
export class Beneficiary {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({})
  bank_code: string;

  @Column({})
  bank_name: string;

  @Column({})
  account_name: string;

  @Column({})
  account_number: string;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column()
  user_id: number;
}
