import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { normalizeEmail } from '../../common/transformers/normalize-email';

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin123!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
