import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId =
      req?.body?.user_id ??
      (req?.headers?.['x-user-id'] as string | undefined);
    const ip =
      req?.ip ??
      req?.socket?.remoteAddress ??
      req?.connection?.remoteAddress ??
      'unknown';
    return userId ? `user:${String(userId)}` : `ip:${ip}`;
  }
}
