import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import { nextTestElectionCode } from '../elections/election-code.utils';

type Status = 'PENDING' | 'CREATED' | 'ACTIVE' | 'CLOSED' | 'PUBLISHED' | 'CANCELLED';

interface ResultsBody {
  electionId: string;
  electionName: string;
  totalVotes: number;
  blankVotes: number;
  candidacies: Array<{
    candidacyId: string;
    candidateId: string;
    candidateName: string;
    positionNumber: number;
    votes: number;
  }>;
}

interface SwaggerOperationShape {
  tags?: string[];
  parameters?: Array<{ name: string; in: string }>;
  security?: unknown[];
  responses: Record<string, { content?: Record<string, { schema: { $ref?: string } }> }>;
}

const PAST = new Date('2026-01-01T00:00:00.000Z');
const TIME = new Date('1970-01-01T08:00:00.000Z');

describe('Final election results (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = Date.now();
  const electionIds: string[] = [];
  const candidateIds: string[] = [];

  let publishedId = '';
  let publishedName = '';
  let firstCandidacy = { id: '', candidateId: '' };
  let secondCandidacy = { id: '', candidateId: '' };
  let thirdCandidacy = { id: '', candidateId: '' };

  async function seedElection(status: Status): Promise<{ id: string; name: string }> {
    const name = `E2E-RESULTS-${suffix}-${Math.random()}`;
    const row = await prisma.election.create({
      data: {
        electionCode: await nextTestElectionCode(prisma),
        name,
        description: 'final results e2e',
        start_date: PAST,
        start_time: TIME,
        end_date: PAST,
        end_time: TIME,
        current_status: status,
        blank_vote_enabled: true,
      },
    });
    electionIds.push(row.id);
    return { id: row.id, name };
  }

  async function seedCandidacy(
    electionId: string,
    position: number,
    first: string,
    last: string,
  ): Promise<{ id: string; candidateId: string }> {
    const candidate = await prisma.candidate.create({
      data: {
        first_name: first,
        last_name: last,
        student_code: `E2ERES-${suffix}-${Math.random()}`,
        program_code: '1234',
        identification_number: `E2ERESI-${suffix}-${Math.random()}`,
        status: 'ACTIVE',
      },
    });
    candidateIds.push(candidate.id);
    const candidacy = await prisma.candiday.create({
      data: { election_id: electionId, candidate_id: candidate.id, position_number: position },
    });
    return { id: candidacy.id, candidateId: candidate.id };
  }

  async function seedVotes(electionId: string, candidacyId: string | null, count: number) {
    await prisma.anonymousVote.createMany({
      data: Array.from({ length: count }, () => ({
        election_id: electionId,
        ballot_id: randomUUID(),
        candidacy_id: candidacyId,
        payload: { secret: 'never-exposed' },
      })),
    });
  }

  const getResults = (electionId: string) =>
    request(app.getHttpServer()).get(`/api/v1/elections/${electionId}/results`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const published = await seedElection('PUBLISHED');
    publishedId = published.id;
    publishedName = published.name;
    // Created out of order on purpose: the response must follow positionNumber.
    secondCandidacy = await seedCandidacy(publishedId, 2, 'Luis', 'Gómez');
    firstCandidacy = await seedCandidacy(publishedId, 1, 'Ana', 'Pérez');
    thirdCandidacy = await seedCandidacy(publishedId, 3, 'Sin', 'Votos');
    await seedVotes(publishedId, firstCandidacy.id, 6);
    await seedVotes(publishedId, secondCandidacy.id, 2);
    await seedVotes(publishedId, null, 2);
  });

  afterAll(async () => {
    await prisma.anonymousVote.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.candiday.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.election.deleteMany({ where: { id: { in: electionIds } } });
    await prisma.candidate.deleteMany({ where: { id: { in: candidateIds } } });
    await app.close();
  });

  it('200: returns the exact contract for a PUBLISHED election without cookie', async () => {
    const res = await getResults(publishedId).expect(200);

    expect(res.body).toEqual({
      electionId: publishedId,
      electionName: publishedName,
      totalVotes: 10,
      blankVotes: 2,
      candidacies: [
        {
          candidacyId: firstCandidacy.id,
          candidateId: firstCandidacy.candidateId,
          candidateName: 'Ana Pérez',
          positionNumber: 1,
          votes: 6,
        },
        {
          candidacyId: secondCandidacy.id,
          candidateId: secondCandidacy.candidateId,
          candidateName: 'Luis Gómez',
          positionNumber: 2,
          votes: 2,
        },
        {
          candidacyId: thirdCandidacy.id,
          candidateId: thirdCandidacy.candidateId,
          candidateName: 'Sin Votos',
          positionNumber: 3,
          votes: 0,
        },
      ],
    } satisfies ResultsBody);
  });

  it('200: ignores an invalid access_token cookie (public endpoint)', async () => {
    await getResults(publishedId).set('Cookie', 'access_token=not-a-jwt').expect(200);
  });

  it('does not expose ballots, payloads or elector data', async () => {
    const res = await getResults(publishedId).expect(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/ballot|payload|never-exposed|elector|email|imageUrl/i);
  });

  it('200: PUBLISHED election without candidacies or votes returns zeros', async () => {
    const empty = await seedElection('PUBLISHED');
    const res = await getResults(empty.id).expect(200);
    expect(res.body).toEqual({
      electionId: empty.id,
      electionName: empty.name,
      totalVotes: 0,
      blankVotes: 0,
      candidacies: [],
    });
  });

  it('200: only blank votes keeps every candidacy at 0', async () => {
    const election = await seedElection('PUBLISHED');
    await seedCandidacy(election.id, 1, 'Solo', 'Blancos');
    await seedVotes(election.id, null, 3);
    const body = (await getResults(election.id).expect(200)).body as ResultsBody;
    expect(body.totalVotes).toBe(3);
    expect(body.blankVotes).toBe(3);
    expect(body.candidacies[0].votes).toBe(0);
  });

  it('400: electionId is not a UUID', async () => {
    await getResults('not-a-uuid').expect(400);
  });

  it('404: election does not exist', async () => {
    const res = await getResults(randomUUID()).expect(404);
    expect(JSON.stringify(res.body)).toContain('ELECTION_NOT_FOUND');
  });

  it.each<Status>(['PENDING', 'CREATED', 'ACTIVE', 'CLOSED', 'CANCELLED'])(
    '409 RESULTS_NOT_PUBLISHED when the election is %s',
    async (status) => {
      const election = await seedElection(status);
      await seedVotes(election.id, null, 1);
      const res = await getResults(election.id).expect(409);
      expect(JSON.stringify(res.body)).toContain('RESULTS_NOT_PUBLISHED');
    },
  );

  it('the existing anonymous-voting results endpoint still answers 200 on CLOSED', async () => {
    const closed = await seedElection('CLOSED');
    await getResults(closed.id).expect(409);
    await request(app.getHttpServer())
      .get(`/api/v1/elections/${closed.id}/anonymous-voting/results`)
      .expect(200);
  });

  it('is read-only: status and row counts do not change', async () => {
    const before = await prisma.anonymousVote.count({ where: { election_id: publishedId } });
    await getResults(publishedId).expect(200);
    await getResults(publishedId).expect(200);
    const after = await prisma.anonymousVote.count({ where: { election_id: publishedId } });
    const election = await prisma.election.findUnique({ where: { id: publishedId } });
    expect(after).toBe(before);
    expect(election?.current_status).toBe('PUBLISHED');
  });

  it('Swagger documents the public endpoint, its response and errors', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Votium API').setVersion('1.0').build(),
    );
    const pathKey = Object.keys(document.paths).find((p) =>
      p.endsWith('/elections/{electionId}/results'),
    );
    expect(pathKey).toBeDefined();
    const operation = document.paths[pathKey!].get as unknown as SwaggerOperationShape;
    expect(operation.tags).toContain('results');
    expect(operation.security ?? []).toHaveLength(0);
    expect(operation.parameters?.some((p) => p.name === 'electionId' && p.in === 'path')).toBe(
      true,
    );
    expect(Object.keys(operation.responses)).toEqual(
      expect.arrayContaining(['200', '400', '404', '409']),
    );
    expect(operation.responses['200'].content?.['application/json'].schema.$ref).toContain(
      'FinalElectionResultsResponseDto',
    );
  });
});
