import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { BallotAccessGuard } from './ballot-access.guard';

type GuardRequest = Request & { user?: { actorType?: string; role?: string } };

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

describe('BallotAccessGuard', () => {
  const guard = new BallotAccessGuard();

  it('GC-01: allows a USER token with role ADMINISTRATOR', () => {
    expect(guard.canActivate(contextWithUser({ actorType: 'USER', role: 'ADMINISTRATOR' }))).toBe(
      true,
    );
  });

  it('GC-02: allows a USER token with role AUDITOR', () => {
    expect(guard.canActivate(contextWithUser({ actorType: 'USER', role: 'AUDITOR' }))).toBe(true);
  });

  it('GC-03: allows an ELECTOR token without a role claim', () => {
    expect(guard.canActivate(contextWithUser({ actorType: 'ELECTOR' }))).toBe(true);
  });

  it.each(['SUPERVISOR', 'VOTER', ''])(
    'GC-04: rejects a USER token with unknown role %j with ForbiddenException',
    (role) => {
      expect(() => guard.canActivate(contextWithUser({ actorType: 'USER', role }))).toThrow(
        ForbiddenException,
      );
    },
  );

  it('GC-05: rejects a request without req.user with ForbiddenException', () => {
    expect(() => guard.canActivate(contextWithNoUser())).toThrow(ForbiddenException);
  });

  it('GC-06: rejects a role-less, non-ELECTOR token with ForbiddenException', () => {
    expect(() => guard.canActivate(contextWithUser({ actorType: 'USER' }))).toThrow(
      ForbiddenException,
    );
  });

  it('GC-06b: rejects a payload without actorType or role with ForbiddenException', () => {
    expect(() => guard.canActivate(contextWithUser({}))).toThrow(ForbiddenException);
  });

  it.each(['elector', 'Elector', 'ELECTOR ', ' ELECTOR'])(
    'GC-07: rejects actorType variation %j due to case-sensitive comparison',
    (actorType) => {
      expect(() => guard.canActivate(contextWithUser({ actorType }))).toThrow(ForbiddenException);
    },
  );

  it('GC-08: ignores client-controlled claims in body/query/headers and only trusts req.user', () => {
    const req = {
      user: { actorType: 'USER' },
      body: { actorType: 'ELECTOR', role: 'ADMINISTRATOR' },
      query: { actorType: 'ELECTOR', role: 'ADMINISTRATOR' },
      headers: { 'x-actor-type': 'ELECTOR', 'x-role': 'ADMINISTRATOR' },
    } as unknown as GuardRequest;

    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('GC-09: allows an ELECTOR token carrying an extra role (OR semantics)', () => {
    expect(
      guard.canActivate(contextWithUser({ actorType: 'ELECTOR', role: 'ADMINISTRATOR' })),
    ).toBe(true);
  });
});
