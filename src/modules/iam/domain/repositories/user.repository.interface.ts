import { UserEntity } from '../entities/user.entity';
import { UserStatus } from '../value-objects/user-status.vo';

export const USER_REPOSITORY = 'UserRepository';

export interface UserRepository {
  // Returns the user with the given id, or null when it does not exist or has
  // been logically deleted (`deleted_at != null`).
  findById(id: string): Promise<UserEntity | null>;

  // Returns the user whose email matches (case-insensitively), or null. Includes
  // logically deleted users so that a deleted email remains reserved (the unique
  // constraint is global); callers that authenticate must check `isDeleted()`.
  findByEmail(email: string): Promise<UserEntity | null>;

  save(entity: UserEntity): Promise<UserEntity>;

  // Lists users, excluding logically deleted rows (`deleted_at IS NULL`).
  findAll(params: UserListParams): Promise<{ users: UserEntity[]; total: number }>;

  // Updates ONLY the user's status. Returns the updated user, or null when the id
  // does not exist. Callers must validate existence through findById first, which
  // excludes logically deleted rows.
  updateStatus(id: string, status: UserStatus): Promise<UserEntity | null>;

  // Atomically deactivates the user (sets `status = 'DISABLED'`), enforcing the
  // last-Auditor invariant when the target is an active, non-deleted Auditor.
  deactivate(id: string): Promise<DeactivateUserOutcome>;

  // Atomically soft-deletes the user (sets `deleted_at`), enforcing the
  // last-Auditor invariant when the target is an active, non-deleted Auditor.
  // Never performs a physical deletion.
  softDelete(id: string): Promise<DeleteUserOutcome>;
}

export interface UserListParams {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  status?: UserStatus;
}

export type DeactivateUserOutcome =
  | { outcome: 'deactivated'; user: UserEntity }
  | { outcome: 'not_found' }
  | { outcome: 'already_disabled' }
  | { outcome: 'last_auditor' };

export type DeleteUserOutcome =
  | { outcome: 'deleted'; user: UserEntity }
  | { outcome: 'not_found' }
  | { outcome: 'already_deleted' }
  | { outcome: 'last_auditor' };
