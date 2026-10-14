import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { ElectorGuard } from './elector.guard';

type GuardRequest = Request & { user?: { actorType?: string } };

function contextWithUser(user: unknown): ExecutionContext {
  const req = { user } as GuardRequest;
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function contextWithNoUser(): ExecutionContext {
  const req = {} as GuardRequest;
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('ElectorGuard', () => {
  const guard = new ElectorGuard();

  it('allows a token whose actorType is exactly ELECTOR', () => {
    expect(guard.canActivate(contextWithUser({ actorType: 'ELECTOR' }))).toBe(true);
  });

  it.each(['USER', 'ADMIN', 'AUDITOR'])(
    'rejects actorType %s with ForbiddenException',
    (actorType) => {
      expect(() => guard.canActivate(contextWithUser({ actorType }))).toThrow(ForbiddenException);
    },
  );

  it('rejects a payload without actorType', () => {
    expect(() => guard.canActivate(contextWithUser({}))).toThrow(ForbiddenException);
  });

  it('rejects an empty actorType', () => {
    expect(() => guard.canActivate(contextWithUser({ actorType: '' }))).toThrow(ForbiddenException);
  });

  it.each(['elector', 'Elector', 'ELECTOR '])(
    'rejects actorType variation %j due to case-sensitive comparison',
    (actorType) => {
      expect(() => guard.canActivate(contextWithUser({ actorType }))).toThrow(ForbiddenException);
    },
  );

  it('rejects a request without req.user', () => {
    expect(() => guard.canActivate(contextWithNoUser())).toThrow(ForbiddenException);
  });

  it('ignores client-controlled actorType in body/query/headers and only trusts req.user', () => {
    const req = {
      user: { actorType: 'USER' },
      body: { actorType: 'ELECTOR' },
      query: { actorType: 'ELECTOR' },
      headers: { 'x-actor-type': 'ELECTOR' },
    } as unknown as GuardRequest;

    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
