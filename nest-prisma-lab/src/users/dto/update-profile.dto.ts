import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeEmail } from '../../common/transformers/normalize-email';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Somchai J.', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'new@example.com' })
  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: 'New password. Requires current_password.',
    minLength: 8,
    maxLength: 72,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;

  @ApiPropertyOptional({ description: 'Required when changing the password' })
  @IsOptional()
  @IsString()
  current_password?: string;
}
