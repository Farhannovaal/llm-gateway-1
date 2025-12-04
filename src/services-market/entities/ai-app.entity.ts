import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'ai_app' })
export class AiApp {
  @PrimaryGeneratedColumn('uuid')
  id: string; // char(36)

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 128, unique: true })
  apiKey: string;

  @Column({ type: 'json', nullable: true })
  allowedModels: string[] | null;

  @Column({ type: 'json', nullable: true })
  allowedAssistants: string[] | null;

  @Column({ type: 'int', nullable: true })
  rateLimitPerMin: number | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'createdAt', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'datetime' })
  updatedAt: Date;
}
