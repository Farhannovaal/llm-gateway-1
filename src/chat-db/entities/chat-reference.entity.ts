import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ChatTurn } from './chat-turn.entity';

@Entity('chat_reference')
export class ChatReference {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ChatTurn, (t) => t.references, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'turnId' })
  turn!: ChatTurn;

  @Column({ type: 'char', length: 36 })
  turnId!: string;

  @Column({ type: 'int' })
  idx!: number;

  @Column({ type: 'varchar', length: 255 })
  source!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  uri!: string | null;
}
