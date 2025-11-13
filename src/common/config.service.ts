import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import * as dotenv from 'dotenv';

import { EnvSchema } from './config.schema';

dotenv.config();

@Injectable()
export class ConfigService {
  private readonly cfg: EnvSchema;

  constructor() {
    const validated = plainToInstance(EnvSchema, process.env, {
      enableImplicitConversion: true,
    });

    const errors = validateSync(validated, {
      skipMissingProperties: false,
    });

    if (errors.length) {
      const msgs = errors
        .map(
          (e) =>
            `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
        )
        .join(' | ');

      throw new Error('Invalid .env: ' + msgs);
    }

    this.cfg = validated;
  }

  get env(): EnvSchema {
    return this.cfg;
  }
}
