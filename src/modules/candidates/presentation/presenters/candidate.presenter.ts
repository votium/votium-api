import { CandidateEntity } from '../../domain/entities/candidate.entity';
import {
  CandidateResponseDto,
  CandidateDetailResponseDto,
  CandidateElectionDto,
} from '../dtos/candidate-response.dto';
import type { CandidacyWithElection } from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';

export class CandidatePresenter {
  static toResponse(entity: CandidateEntity): CandidateResponseDto {
    return new CandidateResponseDto({
      id: entity.id as string,
      firstName: entity.firstName,
      lastName: entity.lastName,
      studentCode: entity.studentCode,
      programCode: entity.programCode,
      identificationNumber: entity.identificationNumber,
      status: entity.status,
      companionFirstName: entity.companionFirstName,
      companionLastName: entity.companionLastName,
      companionStudentCode: entity.companionStudentCode,
      companionProgramCode: entity.companionProgramCode,
      companionIdentification: entity.companionIdentification,
      createdAt: entity.createdAt?.toISOString() ?? '',
    });
  }

  static toList(entities: CandidateEntity[]): CandidateResponseDto[] {
    return entities.map((entity) => CandidatePresenter.toResponse(entity));
  }

  static toDetail(
    candidate: CandidateEntity,
    elections: CandidacyWithElection[],
    now: Date = new Date(),
  ): CandidateDetailResponseDto {
    const electionDtos = elections.map((e) => {
      const isScheduleActive = CandidatePresenter.isWithinSchedule(
        e.electionStartDate,
        e.electionStartTime,
        e.electionEndDate,
        e.electionEndTime,
        now,
      );
      return new CandidateElectionDto({
        id: e.id,
        name: e.electionName,
        status: e.electionStatus,
        startDate: e.electionStartDate.toISOString().split('T')[0],
        startTime: e.electionStartTime.toISOString().split('T')[1],
        endDate: e.electionEndDate.toISOString().split('T')[0],
        endTime: e.electionEndTime.toISOString().split('T')[1],
        isScheduleActive,
      });
    });

    const isCurrentlyActive = electionDtos.some((e) => e.isScheduleActive);

    return new CandidateDetailResponseDto({
      id: candidate.id as string,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      studentCode: candidate.studentCode,
      programCode: candidate.programCode,
      identificationNumber: candidate.identificationNumber,
      status: candidate.status,
      companionFirstName: candidate.companionFirstName,
      companionLastName: candidate.companionLastName,
      companionStudentCode: candidate.companionStudentCode,
      companionProgramCode: candidate.companionProgramCode,
      companionIdentification: candidate.companionIdentification,
      createdAt: candidate.createdAt?.toISOString() ?? '',
      elections: electionDtos,
      isCurrentlyActive,
    });
  }

  private static isWithinSchedule(
    startDate: Date,
    startTime: Date,
    endDate: Date,
    endTime: Date,
    now: Date,
  ): boolean {
    const startInstant = Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate(),
      startTime.getUTCHours(),
      startTime.getUTCMinutes(),
      startTime.getUTCSeconds(),
    );
    const endInstant = Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate(),
      endTime.getUTCHours(),
      endTime.getUTCMinutes(),
      endTime.getUTCSeconds(),
    );
    const nowInstant = now.getTime();
    return startInstant <= nowInstant && nowInstant <= endInstant;
  }
}
