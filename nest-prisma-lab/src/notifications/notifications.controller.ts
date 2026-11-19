import { SuccessMessage } from '../common/decorators/success-message.decorator';
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'List my notifications',
    description:
      'Events recorded when one of my bookings is created or cancelled, newest first.',
  })
  @ApiResponse({ status: 200, description: 'Paginated notifications' })
  @ApiErrors(400, 401)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.findAll(user.userId, query);
  }

  @Patch(':id/read')
  @SuccessMessage('Notification marked as read')
  @ApiOperation({ summary: 'Mark one of my notifications as read' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: 'The notification with read_at set',
  })
  @ApiErrors(400, 401, 404)
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.notificationsService.markRead(user.userId, id);
  }
}
