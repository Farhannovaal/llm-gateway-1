import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'ai_knowledge_base' })
export class AiKnowledgeBase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ type: 'json' })
  tags: string[];

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'vectorIndex', length: 100 })
  vectorIndex: string;

  @Column({ name: 'isActive', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'createdAt', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'datetime' })
  updatedAt: Date;
}
