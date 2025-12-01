import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { ChatSession } from './chat-session.entity';
import { ChatReference } from './chat-reference.entity';

@Entity('chat_turn')
export class ChatTurn {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ChatSession, (s) => s.turns, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session!: ChatSession;

  @Column({ type: 'char', length: 36 })
  sessionId!: string;

  @Column({ type: 'text' })
  userText!: string;

  @Column({ type: 'text' })
  assistantText!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  mode!: string | null; // 'auto' | 'rag-only' | 'llm-only'

  @Column({ type: 'tinyint', default: 0 })
  usedRag!: boolean;

  @Column({ type: 'int', default: 0 })
  hitsCount!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  modelId!: string | null;

  @Column({ type: 'int', nullable: true })
  latencyMs!: number | null;

  @Column({ type: 'json', nullable: true })
  meta!: any | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @OneToMany(() => ChatReference, (r) => r.turn)
  references!: ChatReference[];
}
