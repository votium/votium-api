import { IsEmail, IsEnum, IsString } from 'class-validator';
import { RoleName } from '../../domain/value-objects/role-name.vo';

export class CreateUserDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsEnum(RoleName)
  role!: RoleName;
}
