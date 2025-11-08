import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '../config.service';

@Injectable()
export class HmacGuard implements CanActivate {
  constructor(private cfg: ConfigService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const provided = req.headers['x-internal-auth'];
    if (!provided) throw new UnauthorizedException('Missing X-Internal-Auth');
    const expected = crypto
      .createHmac('sha256', this.cfg.env.HMAC_SHARED_SECRET)
      .update('chat-stream')
      .digest('hex');
    if (provided !== expected) throw new UnauthorizedException('Invalid HMAC');
    return true;
  }
}
