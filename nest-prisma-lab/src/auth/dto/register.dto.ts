import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeEmail } from '../../common/transformers/normalize-email';

export class RegisterDto {
  @ApiProperty({ example: 'Somchai Jaidee', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'somchai@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'Passw0rd!', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
