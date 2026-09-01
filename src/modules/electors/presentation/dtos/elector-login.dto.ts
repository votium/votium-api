import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class ElectorLoginDto {
  @ApiProperty({ example: 'juan.garcia@correounivalle.edu.co' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SuperSecret123!' })
  @IsString()
  password!: string;
}
