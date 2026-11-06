import type { CandidacyRepository } from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import type { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { ElectoralRollRepository } from 'src/modules/elections/domain/repositories/electoral-roll.repository.interface';
import type { BlindSignaturePort, ElectionKeyPair } from '../../domain/crypto/blind-signature.port';
import type { KeyProtectionPort } from '../../domain/crypto/key-protection.port';
import type { ProofVerifierPort } from '../../domain/crypto/proof-verifier.port';
import type { SchnorrProof } from '../../domain/crypto/schnorr-zkp';
import { BallotAlreadyUsedError } from '../../domain/errors/ballot-already-used.error';
import { BallotCredentialAlreadyIssuedError } from '../../domain/errors/ballot-credential-already-issued.error';
import { BallotReceiptNotFoundError } from '../../domain/errors/ballot-receipt-not-found.error';
import { BlankVoteDisabledError } from '../../domain/errors/blank-vote-disabled.error';
import { CommitmentAlreadyRegisteredError } from '../../domain/errors/commitment-already-registered.error';
import { ElectionNotActiveError } from '../../domain/errors/election-not-active.error';
import { InvalidProofError } from '../../domain/errors/invalid-proof.error';
import { InvalidSignatureError } from '../../domain/errors/invalid-signature.error';
import { NotEligibleError } from '../../domain/errors/not-eligible.error';
import { ResultsNotAvailableError } from '../../domain/errors/results-not-available.error';
import type {
  AnonymousBallotReceipt,
  AnonymousVotingRepository,
  CastAnonymousVoteInput,
  IssueCredentialInput,
  StoredElectionKey,
  TallyRow,
} from '../../domain/repositories/anonymous-voting.repository.interface';
import { ElectionKeyProvisioner } from '../election-key-provisioner';
import { CastAnonymousVoteUseCase } from '../use-cases/cast-anonymous-vote.use-case';
import { GetAnonymousBallotReceiptUseCase } from '../use-cases/get-anonymous-ballot-receipt.use-case';
import { GetAnonymousVotingResultsUseCase } from '../use-cases/get-anonymous-voting-results.use-case';
import { GetBallotCredentialStatusUseCase } from '../use-cases/get-ballot-credential-status.use-case';
import { GetBlindSignaturePublicKeyUseCase } from '../use-cases/get-blind-signature-public-key.use-case';
import { IssueBallotCredentialUseCase } from '../use-cases/issue-ballot-credential.use-case';

const ELECTION = 'election-1';
const ELECTOR = 'elector-1';
const CANDIDACY = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const BALLOT = '5b1e8a3c-6f2d-4c1a-9b7e-0d3f2a1c9e10';
const Y = 'a'.repeat(64);
const BLINDED = 'b'.repeat(512);
const PROOF: SchnorrProof = { y: Y, t: 'c'.repeat(64), c: 'd'.repeat(64), s: 'e'.repeat(64) };
const NOW = new Date('2026-11-04T12:00:00Z');

// ---- test doubles ---------------------------------------------------------

function fakeElection(status: string, opts: { blank?: boolean; inWindow?: boolean } = {}) {
  return {
    id: ELECTION,
    currentStatus: status,
    blankVoteEnabled: opts.blank ?? true,
    canAcceptVotes: () => status === 'ACTIVE',
    isWithinSchedule: () => opts.inWindow ?? true,
  } as unknown as ElectionEntity;
}

class FakeElections implements Pick<ElectionRepository, 'findById'> {
  constructor(private readonly election: ElectionEntity | null) {}
  findById(): Promise<ElectionEntity | null> {
    return Promise.resolve(this.election);
  }
}

const electionsOf = (e: ElectionEntity | null) =>
  new FakeElections(e) as unknown as ElectionRepository;

const rollsOf = (present: boolean) =>
  ({
    findByElectionAndElectorIds: () => Promise.resolve(present ? [{ electorId: ELECTOR }] : []),
  }) as unknown as ElectoralRollRepository;

const candidaciesOf = (ids: string[]) =>
  ({
    findByElection: () => Promise.resolve(ids.map((id) => ({ id }))),
  }) as unknown as CandidacyRepository;

class FakeSigner implements BlindSignaturePort {
  validSignature = true;
  generated = 0;
  generateKeyPair(): Promise<ElectionKeyPair> {
    this.generated++;
    return Promise.resolve({
      publicKeySpki: Uint8Array.from([1, 2, 3]),
      privateKeyPkcs8: Uint8Array.from([9, 9, 9]),
    });
  }
  blindSign(): Promise<Uint8Array> {
    return Promise.resolve(Uint8Array.from([7, 7]));
  }
  verify(): Promise<boolean> {
    return Promise.resolve(this.validSignature);
  }
}

const protection: KeyProtectionPort = {
  encrypt: (plain) => Buffer.from(plain).toString('base64'),
  decrypt: (enc) => new Uint8Array(Buffer.from(enc, 'base64')),
};

class FakeVerifier implements ProofVerifierPort {
  valid = true;
  verify(): Promise<boolean> {
    return Promise.resolve(this.valid);
  }
}

// In-memory repository. It mirrors the transactional guarantees of the Prisma implementation:
// one credential per elector and election, one y per election, one ballot per ballot_id.
class FakeRepository implements AnonymousVotingRepository {
  keys = new Map<string, StoredElectionKey>();
  credentials = new Set<string>();
  commitments = new Set<string>();
  ballots = new Map<string, { candidacyId: string | null; registeredAt: Date }>();

  findElectionKey(electionId: string) {
    return Promise.resolve(this.keys.get(electionId) ?? null);
  }
  saveElectionKeyIfAbsent(electionId: string, key: StoredElectionKey) {
    if (!this.keys.has(electionId)) this.keys.set(electionId, key);
    return Promise.resolve();
  }
  async issueCredential(input: IssueCredentialInput, sign: (enc: string) => Promise<Uint8Array>) {
    const key = `${input.electionId}|${input.electorId}`;
    if (this.credentials.has(key)) throw new BallotCredentialAlreadyIssuedError();
    if (this.commitments.has(`${input.electionId}|${input.y}`))
      throw new CommitmentAlreadyRegisteredError();
    const signature = await sign(this.keys.get(input.electionId)!.privateKeyEnc);
    this.credentials.add(key);
    this.commitments.add(`${input.electionId}|${input.y}`);
    return signature;
  }
  hasCredentialIssued(electionId: string, electorId: string) {
    return Promise.resolve(this.credentials.has(`${electionId}|${electorId}`));
  }
  hasCommitment(electionId: string, y: string) {
    return Promise.resolve(this.commitments.has(`${electionId}|${y}`));
  }
  castVote(input: CastAnonymousVoteInput) {
    if (this.ballots.has(input.ballotId)) throw new BallotAlreadyUsedError();
    this.ballots.set(input.ballotId, { candidacyId: input.candidacyId, registeredAt: input.now });
    return Promise.resolve();
  }
  findReceipt(electionId: string, ballotId: string): Promise<AnonymousBallotReceipt | null> {
    const b = this.ballots.get(ballotId);
    return Promise.resolve(b ? { electionId, ballotId, registeredAt: b.registeredAt } : null);
  }
  tally(): Promise<TallyRow[]> {
    const counts = new Map<string | null, number>();
    for (const b of this.ballots.values())
      counts.set(b.candidacyId, (counts.get(b.candidacyId) ?? 0) + 1);
    return Promise.resolve([...counts].map(([candidacyId, votes]) => ({ candidacyId, votes })));
  }
}

// ---- public key -----------------------------------------------------------

describe('GetBlindSignaturePublicKeyUseCase', () => {
  it('fails for an unknown election', async () => {
    const uc = new GetBlindSignaturePublicKeyUseCase(
      electionsOf(null),
      new ElectionKeyProvisioner(new FakeRepository(), new FakeSigner(), protection),
    );
    await expect(uc.execute(ELECTION)).rejects.toMatchObject({ code: 'ELECTION_NOT_FOUND' });
  });

  it('refuses an election that is not CREATED or ACTIVE', async () => {
    const uc = new GetBlindSignaturePublicKeyUseCase(
      electionsOf(fakeElection('PENDING')),
      new ElectionKeyProvisioner(new FakeRepository(), new FakeSigner(), protection),
    );
    await expect(uc.execute(ELECTION)).rejects.toBeInstanceOf(ElectionNotActiveError);
  });

  it('generates the key once and returns the same key on later calls', async () => {
    const repo = new FakeRepository();
    const signer = new FakeSigner();
    const uc = new GetBlindSignaturePublicKeyUseCase(
      electionsOf(fakeElection('CREATED')),
      new ElectionKeyProvisioner(repo, signer, protection),
    );
    const first = await uc.execute(ELECTION);
    const second = await uc.execute(ELECTION);
    expect(first.publicKeyPem).toBe(second.publicKeyPem);
    expect(first.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(signer.generated).toBe(1);
  });
});

// ---- credential issuance ---------------------------------------------------

describe('IssueBallotCredentialUseCase', () => {
  function build(opts: { status?: string; inWindow?: boolean; inRoll?: boolean } = {}) {
    const repo = new FakeRepository();
    const signer = new FakeSigner();
    const keys = new ElectionKeyProvisioner(repo, signer, protection);
    const uc = new IssueBallotCredentialUseCase(
      electionsOf(fakeElection(opts.status ?? 'ACTIVE', { inWindow: opts.inWindow })),
      rollsOf(opts.inRoll ?? true),
      repo,
      signer,
      protection,
      keys,
    );
    return { uc, repo };
  }
  const input = {
    electionId: ELECTION,
    electorId: ELECTOR,
    y: Y,
    blindedMessageHex: BLINDED,
    now: NOW,
  };

  it('returns the blind signature and records the credential', async () => {
    const { uc, repo } = build();
    expect(Buffer.from(await uc.execute(input)).toString('hex')).toBe('0707');
    expect(await repo.hasCredentialIssued(ELECTION, ELECTOR)).toBe(true);
  });

  it('refuses when the election is not ACTIVE', async () => {
    await expect(build({ status: 'CREATED' }).uc.execute(input)).rejects.toBeInstanceOf(
      ElectionNotActiveError,
    );
  });

  it('refuses outside the schedule window', async () => {
    await expect(build({ inWindow: false }).uc.execute(input)).rejects.toMatchObject({
      code: 'ELECTION_NOT_WITHIN_SCHEDULE',
    });
  });

  it('refuses an elector outside the electoral roll', async () => {
    await expect(build({ inRoll: false }).uc.execute(input)).rejects.toMatchObject({
      code: 'ELECTORAL_ROLL_NOT_FOUND',
    });
  });

  it('refuses a second credential for the same elector', async () => {
    const { uc } = build();
    await uc.execute(input);
    await expect(uc.execute({ ...input, y: 'f'.repeat(64) })).rejects.toBeInstanceOf(
      BallotCredentialAlreadyIssuedError,
    );
  });

  it('refuses a y already registered in the same election', async () => {
    const { uc, repo } = build();
    await uc.execute(input);
    await repo.saveElectionKeyIfAbsent(ELECTION, { publicKeyPem: 'x', privateKeyEnc: 'x' });
    await expect(uc.execute({ ...input, electorId: 'other' })).rejects.toBeInstanceOf(
      CommitmentAlreadyRegisteredError,
    );
  });
});

// ---- status and votes ------------------------------------------------------

describe('GetBallotCredentialStatusUseCase', () => {
  it('reports false before issuance and true after', async () => {
    const repo = new FakeRepository();
    const uc = new GetBallotCredentialStatusUseCase(electionsOf(fakeElection('ACTIVE')), repo);
    expect(await uc.execute(ELECTION, ELECTOR)).toEqual({ credentialIssued: false });
    repo.credentials.add(`${ELECTION}|${ELECTOR}`);
    expect(await uc.execute(ELECTION, ELECTOR)).toEqual({ credentialIssued: true });
  });
});

describe('CastAnonymousVoteUseCase', () => {
  function build(
    opts: {
      status?: string;
      blank?: boolean;
      inWindow?: boolean;
      candidacies?: string[];
      validProof?: boolean;
      validSig?: boolean;
      withKey?: boolean;
    } = {},
  ) {
    const repo = new FakeRepository();
    repo.commitments.add(`${ELECTION}|${Y}`);
    if (opts.withKey !== false)
      repo.keys.set(ELECTION, { publicKeyPem: 'pem', privateKeyEnc: 'x' });
    const verifier = new FakeVerifier();
    verifier.valid = opts.validProof ?? true;
    const signer = new FakeSigner();
    signer.validSignature = opts.validSig ?? true;
    const uc = new CastAnonymousVoteUseCase(
      electionsOf(
        fakeElection(opts.status ?? 'ACTIVE', { blank: opts.blank, inWindow: opts.inWindow }),
      ),
      candidaciesOf(opts.candidacies ?? [CANDIDACY]),
      repo,
      signer,
      verifier,
    );
    return { uc, repo };
  }
  const vote = (overrides: Partial<CastAnonymousVoteInput & { candidacyId: string }> = {}) => ({
    electionId: ELECTION,
    ballotId: BALLOT,
    candidacyId: CANDIDACY,
    signatureHex: 'ab'.repeat(256),
    proof: PROOF,
    now: NOW,
    ...overrides,
  });

  it('registers a candidacy vote and returns the receipt', async () => {
    const { uc, repo } = build();
    expect(await uc.execute(vote())).toEqual({ receipt: BALLOT });
    expect((await repo.findReceipt(ELECTION, BALLOT))?.ballotId).toBe(BALLOT);
  });

  it('stores a blank vote with a null candidacy', async () => {
    const { uc, repo } = build();
    await uc.execute(vote({ candidacyId: 'blank' }));
    expect(await repo.findReceipt(ELECTION, BALLOT)).not.toHaveProperty('candidacyId');
    expect(await repo.tally()).toEqual([{ candidacyId: null, votes: 1 }]);
  });

  it('refuses when the election is not ACTIVE', async () => {
    await expect(build({ status: 'CLOSED' }).uc.execute(vote())).rejects.toBeInstanceOf(
      ElectionNotActiveError,
    );
  });

  it('refuses blank when the election disables it', async () => {
    await expect(
      build({ blank: false }).uc.execute(vote({ candidacyId: 'blank' })),
    ).rejects.toBeInstanceOf(BlankVoteDisabledError);
  });

  it('refuses a candidacy that does not belong to the election', async () => {
    await expect(build({ candidacies: [] }).uc.execute(vote())).rejects.toMatchObject({
      code: 'CANDIDACY_NOT_FOUND',
    });
  });

  it('refuses a y that is not registered', async () => {
    const { uc, repo } = build();
    repo.commitments.clear();
    await expect(uc.execute(vote())).rejects.toBeInstanceOf(NotEligibleError);
  });

  it('refuses an invalid proof before checking the signature', async () => {
    await expect(
      build({ validProof: false, validSig: false }).uc.execute(vote()),
    ).rejects.toBeInstanceOf(InvalidProofError);
  });

  it('refuses an invalid signature', async () => {
    await expect(build({ validSig: false }).uc.execute(vote())).rejects.toBeInstanceOf(
      InvalidSignatureError,
    );
  });

  it('refuses when the election has no key', async () => {
    await expect(build({ withKey: false }).uc.execute(vote())).rejects.toBeInstanceOf(
      InvalidSignatureError,
    );
  });

  it('refuses a reused ballot id', async () => {
    const { uc } = build();
    await uc.execute(vote());
    await expect(uc.execute(vote())).rejects.toBeInstanceOf(BallotAlreadyUsedError);
  });
});

describe('GetAnonymousBallotReceiptUseCase', () => {
  it('returns 404 for an unknown ballot', async () => {
    const uc = new GetAnonymousBallotReceiptUseCase(
      electionsOf(fakeElection('ACTIVE')),
      new FakeRepository(),
    );
    await expect(uc.execute(ELECTION, BALLOT)).rejects.toBeInstanceOf(BallotReceiptNotFoundError);
  });

  it('returns the receipt without a candidacy', async () => {
    const repo = new FakeRepository();
    repo.ballots.set(BALLOT, { candidacyId: CANDIDACY, registeredAt: NOW });
    const receipt = await new GetAnonymousBallotReceiptUseCase(
      electionsOf(fakeElection('ACTIVE')),
      repo,
    ).execute(ELECTION, BALLOT);
    expect(Object.keys(receipt).sort()).toEqual(['ballotId', 'electionId', 'registeredAt']);
  });
});

describe('GetAnonymousVotingResultsUseCase', () => {
  it('refuses while the election is still open', async () => {
    const uc = new GetAnonymousVotingResultsUseCase(
      electionsOf(fakeElection('ACTIVE')),
      candidaciesOf([CANDIDACY]),
      new FakeRepository(),
    );
    await expect(uc.execute(ELECTION)).rejects.toBeInstanceOf(ResultsNotAvailableError);
  });

  it('lists every candidacy (zero included) and shows blank votes apart', async () => {
    const repo = new FakeRepository();
    const other = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    repo.ballots.set('b1', { candidacyId: CANDIDACY, registeredAt: NOW });
    repo.ballots.set('b2', { candidacyId: CANDIDACY, registeredAt: NOW });
    repo.ballots.set('b3', { candidacyId: null, registeredAt: NOW });
    const uc = new GetAnonymousVotingResultsUseCase(
      electionsOf(fakeElection('CLOSED')),
      candidaciesOf([CANDIDACY, other]),
      repo,
    );
    expect(await uc.execute(ELECTION)).toEqual({
      electionId: ELECTION,
      totalVotes: 3,
      candidacies: [
        { candidacyId: CANDIDACY, votes: 2 },
        { candidacyId: other, votes: 0 },
      ],
      blankVotes: 1,
    });
  });

  it('is available once PUBLISHED too', async () => {
    const uc = new GetAnonymousVotingResultsUseCase(
      electionsOf(fakeElection('PUBLISHED')),
      candidaciesOf([]),
      new FakeRepository(),
    );
    expect((await uc.execute(ELECTION)).totalVotes).toBe(0);
  });
});
