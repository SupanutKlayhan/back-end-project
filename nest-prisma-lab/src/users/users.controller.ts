import { SuccessMessage } from '../common/decorators/success-message.decorator';
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'View my profile' })
  @ApiResponse({ status: 200, description: 'The logged-in user (no password)' })
  @ApiErrors(401, 404)
  getProfile(@CurrentUser() user: AuthUser) {
    return this.usersService.getProfile(user.userId);
  }

  @Patch('me')
  @SuccessMessage('Profile updated')
  @ApiOperation({ summary: 'Update my name, e-mail or password' })
  @ApiResponse({ status: 200, description: 'The updated profile' })
  @ApiErrors(400, 401, 409)
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.userId, dto);
  }
}
