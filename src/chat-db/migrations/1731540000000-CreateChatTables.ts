import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatTables1731540000000 implements MigrationInterface {
  name = 'CreateChatTables1731540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE chat_session (
        id char(36) NOT NULL,
        userId varchar(255) NULL,
        title varchar(100) NULL,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        lastActivityAt datetime(6) NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE chat_turn (
        id char(36) NOT NULL,
        sessionId char(36) NOT NULL,
        userText text NOT NULL,
        assistantText text NOT NULL,

        -- meta untuk AI system engineering / analitik
        mode varchar(20) NULL,              -- 'auto' | 'rag-only' | 'llm-only'
        usedRag tinyint(1) NOT NULL DEFAULT 0,
        hitsCount int NOT NULL DEFAULT 0,
        modelId varchar(100) NULL,
        latencyMs int NULL,
        meta json NULL,

        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

        INDEX IDX_chat_turn_session (sessionId),
        INDEX IDX_chat_turn_session_created (sessionId, createdAt),
        PRIMARY KEY (id),
        CONSTRAINT FK_chat_turn_session FOREIGN KEY (sessionId)
          REFERENCES chat_session(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    // REFERENCE: citation hasil RAG
    await queryRunner.query(`
      CREATE TABLE chat_reference (
        id char(36) NOT NULL,
        turnId char(36) NOT NULL,
        idx int NOT NULL,
        source varchar(255) NOT NULL,
        uri varchar(500) NULL,
        INDEX IDX_chat_ref_turn (turnId),
        PRIMARY KEY (id),
        CONSTRAINT FK_chat_ref_turn FOREIGN KEY (turnId)
          REFERENCES chat_turn(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE chat_reference;');
    await queryRunner.query('DROP TABLE chat_turn;');
    await queryRunner.query('DROP TABLE chat_session;');
  }
}
