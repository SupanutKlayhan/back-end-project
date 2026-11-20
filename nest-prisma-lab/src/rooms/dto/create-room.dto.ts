import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRoomDto {
  @ApiProperty({
    description: 'Room name (max 100 characters)',
    example: 'Deluxe Ocean View',
    maxLength: 100,
    type: String,
  })
  @MaxLength(100)
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Free-text description of the room',
    example: 'King bed, private balcony, sea view',
    type: String,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Maximum number of guests (1–50)',
    example: 2,
    minimum: 1,
    maximum: 50,
    type: Number,
  })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(50)
  capacity: number;

  @ApiProperty({
    description: 'Price per night, greater than 0, at most 2 decimal places',
    example: 1500.5,
    minimum: 0.01,
    maximum: 99_999_999.99,
    type: Number,
  })
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(99_999_999.99)
  price_per_night: number;

  @ApiPropertyOptional({
    description: 'URL of a photo of the room',
    example: '/images/room101.jpg',
    type: String,
  })
  @IsOptional()
  @IsString()
  image_url?: string;

  @ApiPropertyOptional({
    description: 'Whether the room can currently be booked',
    example: true,
    default: true,
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
