import { SuccessMessage } from '../common/decorators/success-message.decorator';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import type { AuthUser } from './auth-user';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

const STRICT = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('register')
  @SuccessMessage('Account created')
  @Throttle(STRICT)
  @ApiOperation({ summary: 'Sign up' })
  @ApiResponse({ status: 201, description: 'Account created' })
  @ApiErrors(400, 409, 429)
  register(@Body() registerDto: RegisterDto) {
    return this.usersService.create(
      registerDto.name,
      registerDto.email,
      registerDto.password,
    );
  }

  @Post('login')
  @SuccessMessage('Login successful')
  @HttpCode(HttpStatus.OK)
  @Throttle(STRICT)
  @ApiOperation({ summary: 'Log in and receive a JWT (valid for 1 hour)' })
  @ApiResponse({
    status: 200,
    description: 'Access token',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string', example: 'eyJhbGciOi...' },
      },
    },
  })
  @ApiErrors(400, 401, 429)
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('logout')
  @SuccessMessage('Logged out')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Log out: the current token stops working immediately',
  })
  @ApiResponse({ status: 200, description: 'Logged out' })
  @ApiErrors(401)
  async logout(@CurrentUser() user: AuthUser) {
    await this.authService.logout(user);
    return null;
  }
}
