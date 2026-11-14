import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard'; // ajusta

import { GetBallotUseCase } from '../../application/use-cases/get-ballot.use-case';
import { GetSignatureStatusUseCase } from '../../application/use-cases/get-signature-status.use-case';
import { RequestBlindSignatureUseCase } from '../../application/use-cases/request-blind-signature.use-case';
import { CastVoteUseCase } from '../../application/use-cases/cast-vote.use-case';
import { ReportVotedUseCase } from '../../application/use-cases/report-voted.use-case';

import { CastVoteRequestDto, ElectionParamDto, SignBlindedDto } from '../dtos/vote-processing.dto';

/** Lo mínimo que se lee del JWT. Ajusta `id` si tu payload usa otro campo. */
interface AuthenticatedRequest {
  user: { id: string };
}

@Controller('vote-processing/elections/:electionId')
export class VotingController {
  constructor(
    private readonly getBallot: GetBallotUseCase,
    private readonly getSignatureStatus: GetSignatureStatusUseCase,
    private readonly requestBlindSignature: RequestBlindSignatureUseCase,
    private readonly castVote: CastVoteUseCase,
    private readonly reportVoted: ReportVotedUseCase,
  ) {}

  /**
   * 1. Papeleta: candidatos, llave pública de la elección y formato del mensaje.
   * Pública: no depende de quién la pide.
   */
  @Get('ballot')
  ballot(@Param() { electionId }: ElectionParamDto) {
    return this.getBallot.execute(electionId);
  }

  /**
   * 2. Estado del votante: qué pantalla debe mostrar el frontend.
   * Requiere JWT.
   */
  @UseGuards(JwtAuthGuard)
  @Get('signature/status')
  signatureStatus(@Req() req: AuthenticatedRequest, @Param() { electionId }: ElectionParamDto) {
    return this.getSignatureStatus.execute(req.user.id, electionId);
  }

  /**
   * 3. Firma ciega del mensaje cegado por el frontend.
   * Requiere JWT. Repetir la misma petición devuelve la misma firma.
   */
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('signature')
  sign(
    @Req() req: AuthenticatedRequest,
    @Param() { electionId }: ElectionParamDto,
    @Body() dto: SignBlindedDto,
  ) {
    return this.requestBlindSignature.execute(req.user.id, electionId, dto.blindedMessage);
  }

  /**
   * 4. Emitir el voto. ANÓNIMO.
   *
   * Reglas para no romper el anonimato:
   *  - Sin JwtAuthGuard y sin @Req(), @Ip() ni @Headers(): el controlador no lee ninguna identidad.
   *  - El límite es por IP y holgado, porque muchos votantes pueden compartir salida de red.
   *  - Excluye esta ruta de cualquier interceptor o logger que registre IP, User-Agent o cabeceras.
   */
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('votes')
  cast(@Param() { electionId }: ElectionParamDto, @Body() dto: CastVoteRequestDto) {
    return this.castVote.execute({ electionId, ...dto });
  }

  /**
   * 5. "Ya voté": el frontend lo envía solo, con retraso aleatorio. Requiere JWT y no lleva cuerpo.
   * No se pasa txId ni nullifier a propósito.
   */
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('voted')
  async voted(@Req() req: AuthenticatedRequest, @Param() { electionId }: ElectionParamDto) {
    await this.reportVoted.execute(req.user.id, electionId);
  }
}
