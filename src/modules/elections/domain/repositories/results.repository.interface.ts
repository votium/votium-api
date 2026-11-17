import { ResultEntity } from '../entities/result.entity';

export const RESULTS_REPOSITORY = Symbol('RESULTS_REPOSITORY');

export interface ResultsRepository {
  getResults(electionId: string): Promise<ResultEntity | null>;
}
