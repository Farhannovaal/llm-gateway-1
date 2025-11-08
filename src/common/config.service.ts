import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EnvSchema } from './config.schema';

@Injectable()
export class ConfigService {
  private readonly cfg: EnvSchema;
  constructor() {
    const validated = plainToInstance(EnvSchema, process.env, { enableImplicitConversion: true });
    const errors = validateSync(validated, { skipMissingProperties: false });
    if (errors.length) throw new Error('Invalid .env: ' + JSON.stringify(errors));
    this.cfg = validated;
  }
  get env() { return this.cfg; }
}
