import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ChatTurn } from './chat-turn.entity';

@Entity('chat_session')
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  title!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastActivityAt!: Date | null;

  @OneToMany(() => ChatTurn, (t) => t.session)
  turns!: ChatTurn[];
}
