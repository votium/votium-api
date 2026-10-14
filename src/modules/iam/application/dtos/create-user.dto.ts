import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Jane', description: 'User first name.' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Doe', description: 'User last name.' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'SuperSecret123!',
    description:
      'Must contain at least one lowercase letter, one uppercase letter, one number and one special character. Minimum length 8.',
  })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-z])/, {
    message: 'Password must contain at least one lowercase letter',
  })
  @Matches(/(?=.*[A-Z])/, {
    message: 'Password must contain at least one uppercase letter',
  })
  @Matches(/(?=.*\d)/, { message: 'Password must contain at least one number' })
  @Matches(/(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/, {
    message: 'Password must contain at least one special character',
  })
  password!: string;

  @ApiProperty({ example: 'uuid', description: 'Identifier of the role assigned to the user.' })
  @IsUUID()
  roleId!: string;

  @ApiProperty({ example: 'ACTIVE', required: false, enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'DISABLED'])
  @Type(() => String)
  status?: string;
}
