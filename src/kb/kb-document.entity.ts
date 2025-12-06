import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'kb_document' })
export class KbDocument {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  source: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  uri: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  lang: string | null;

  @Column({ type: 'json', nullable: true })
  tags: string[] | null;

  @Column({ type: 'mediumtext' })
  text: string;

  @Column({ type: 'char', length: 64, nullable: true })
  hash: string | null;

  @CreateDateColumn({ name: 'createdAt', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt', type: 'datetime' })
  updatedAt: Date;
}
