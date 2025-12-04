import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AssistantMode = 'chat' | 'ask' | 'auto';

@Entity({ name: 'ai_assistant' })
export class AiAssistant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50, unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'defaultModel', length: 100 })
  defaultModel: string;

  @Column({
    name: 'defaultMode',
    type: 'enum',
    enum: ['chat', 'ask', 'auto'],
    default: 'auto',
  })
  defaultMode: AssistantMode;

  @Column({ name: 'systemPrompt', type: 'text' })
  systemPrompt: string;

  @Column({ name: 'kbTags', type: 'json', nullable: true })
  kbTags: string[] | null;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.7 })
  temperature: number;

  @Column({ name: 'maxTokens', type: 'int', nullable: true })
  maxTokens: number | null;

  @Column({ name: 'isActive', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'createdAt', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'datetime' })
  updatedAt: Date;
}
