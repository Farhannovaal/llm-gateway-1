import {
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('kb_document')
export class KbDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  source!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  uri!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  lang!: string | null;

  @Column({ type: 'json', nullable: true })
  tags!: string[] | null;

  @Column({ type: 'mediumtext' })
  text!: string;

  @Column({ type: 'char', length: 64, nullable: true })
  hash!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
