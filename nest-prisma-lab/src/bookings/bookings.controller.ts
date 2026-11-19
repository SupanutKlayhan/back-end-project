import { SuccessMessage } from '../common/decorators/success-message.decorator';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';

@ApiTags('bookings')
@ApiBearerAuth('access-token')
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @SuccessMessage('Booking created')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Create a booking',
    description:
      'Status starts as PENDING. Stays are half-open: check_out of one booking may equal check_in of the next.',
  })
  @ApiResponse({ status: 201, description: 'Booking created (status PENDING)' })
  @ApiErrors(400, 401, 404, 409, 429)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List bookings',
    description: 'Users see their own bookings; admins see every booking.',
  })
  @ApiResponse({ status: 200, description: 'Paginated bookings' })
  @ApiErrors(400, 401)
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListBookingsQueryDto) {
    return this.bookingsService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one booking (own booking, or any as admin)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'The booking' })
  @ApiErrors(400, 401, 404)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.bookingsService.findOne(user, id);
  }

  @Patch(':id/cancel')
  @SuccessMessage('Booking cancelled')
  @ApiOperation({ summary: 'Cancel a booking (PENDING or APPROVED only)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'The cancelled booking' })
  @ApiErrors(400, 401, 404, 409)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.bookingsService.cancel(user, id);
  }

  @Patch(':id/status')
  @SuccessMessage('Booking status updated')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Change a booking status (admin only)',
    description:
      'PENDING -> APPROVED/CANCELLED, APPROVED -> PAID/CANCELLED. PAID and CANCELLED are final.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'The updated booking' })
  @ApiErrors(400, 401, 403, 404, 409)
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    return this.bookingsService.updateStatus(user, id, dto.status);
  }
}
