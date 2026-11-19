import {
  applyDecorators,
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SuccessMessage } from '../common/decorators/success-message.decorator';
import { CreateRoomDto } from './dto/create-room.dto';
import { SearchRoomsQueryDto } from './dto/search-rooms-query.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import {
  ROOM_IMAGE_URL_PREFIX,
  roomImageUploadOptions,
  assertRealImage,
} from './room-image.upload';
import { RoomsService } from './rooms.service';

const roomSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    name: { type: 'string', example: 'Deluxe Ocean View' },
    description: {
      type: 'string',
      nullable: true,
      example: 'King bed, private balcony, sea view',
    },
    capacity: { type: 'integer', example: 2 },
    price_per_night: {
      type: 'string',
      example: '1500.50',
      description: 'Decimal value, serialized as a string',
    },
    image_url: {
      type: 'string',
      nullable: true,
      example: '"/images/room101.jpg"',
    },
    is_active: { type: 'boolean', example: true },
    created_at: {
      type: 'string',
      format: 'date-time',
      example: '2026-10-26T01:00:00.000Z',
    },
    updated_at: {
      type: 'string',
      format: 'date-time',
      example: '2026-10-26T01:00:00.000Z',
    },
  },
};

const roomListSchema = {
  type: 'object',
  properties: {
    data: { type: 'array', items: roomSchema },
    meta: {
      type: 'object',
      properties: {
        total: {
          type: 'integer',
          example: 25,
          description: 'Rooms matching the filters',
        },
        page: { type: 'integer', example: 1 },
        limit: { type: 'integer', example: 10 },
        totalPages: { type: 'integer', example: 3 },
      },
    },
  },
};

const errorResponse = (
  status: number,
  description: string,
  message: string | string[],
  error?: string,
) => ({
  status,
  description,
  schema: {
    type: 'object',
    properties: {
      statusCode: { type: 'integer', example: status },
      message: Array.isArray(message)
        ? { type: 'array', items: { type: 'string' }, example: message }
        : { type: 'string', example: message },
      ...(error && { error: { type: 'string', example: error } }),
    },
  },
});

const CommonErrors = () =>
  applyDecorators(
    ApiResponse(errorResponse(401, 'Missing or invalid JWT', 'Unauthorized')),
    ApiResponse(
      errorResponse(
        429,
        'Rate limit exceeded (100 requests per minute)',
        'ThrottlerException: Too Many Requests',
      ),
    ),
  );

@ApiTags('rooms')
@Controller('rooms')
@Throttle({ default: { limit: 100, ttl: 60_000 } })
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  @SuccessMessage('Room created')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new room (admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Room created',
    schema: roomSchema,
  })
  @ApiResponse(
    errorResponse(
      400,
      'Validation failed',
      ['name should not be empty', 'capacity must be an integer number'],
      'Bad Request',
    ),
  )
  @ApiResponse(
    errorResponse(
      403,
      'Admin role required',
      'Forbidden resource',
      'Forbidden',
    ),
  )
  @CommonErrors()
  create(@Body() createRoomDto: CreateRoomDto) {
    return this.roomsService.create(createRoomDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List rooms (public)',
    description:
      'Returns a paginated list of active rooms. Results are cached in Redis for 5 minutes and the cache is cleared whenever a room changes.',
  })
  @ApiQuery({
    name: 'min_capacity',
    required: false,
    type: Number,
    description: 'Only return rooms that fit at least this many guests',
    example: 2,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number, starting at 1 (default 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Rooms per page, 1-100 (default 10)',
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of rooms',
    schema: roomListSchema,
  })
  @ApiResponse(
    errorResponse(
      400,
      'A query parameter has an invalid value',
      'Validation failed (numeric string is expected)',
      'Bad Request',
    ),
  )
  @CommonErrors()
  findAll(
    @Query('min_capacity', new ParseIntPipe({ optional: true }))
    minCapacity?: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
  ) {
    return this.roomsService.findPublic({ minCapacity, page, limit });
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'List all rooms including inactive ones (admin only)',
    description: 'Not cached. Use is_active to filter.',
  })
  @ApiQuery({
    name: 'is_active',
    required: false,
    type: Boolean,
    example: false,
  })
  @ApiQuery({ name: 'min_capacity', required: false, type: Number, example: 2 })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of rooms',
    schema: roomListSchema,
  })
  @ApiResponse(
    errorResponse(
      403,
      'Admin role required',
      'Forbidden resource',
      'Forbidden',
    ),
  )
  @CommonErrors()
  findAllAdmin(
    @Query('is_active', new ParseBoolPipe({ optional: true }))
    isActive?: boolean,
    @Query('min_capacity', new ParseIntPipe({ optional: true }))
    minCapacity?: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
  ) {
    return this.roomsService.findAll({ isActive, minCapacity, page, limit });
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search available rooms by date range and capacity',
    description:
      'Returns only active rooms that fit the guests and have no booking overlapping the dates.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated available rooms',
    schema: roomListSchema,
  })
  @ApiResponse(
    errorResponse(
      400,
      'Invalid or missing dates',
      ['check_in must be before check_out'],
      'Bad Request',
    ),
  )
  search(@Query() query: SearchRoomsQueryDto) {
    return this.roomsService.search(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single room by ID (public, includes image_url)',
    description: 'Inactive rooms answer 404. Cached in Redis for 5 minutes.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Room ID', example: 1 })
  @ApiResponse({ status: 200, description: 'The room', schema: roomSchema })
  @ApiResponse(
    errorResponse(
      400,
      'ID is not a number',
      'Validation failed (numeric string is expected)',
      'Bad Request',
    ),
  )
  @ApiResponse(
    errorResponse(404, 'Room not found', 'Room 99 not found', 'Not Found'),
  )
  @CommonErrors()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.roomsService.findPublicOne(id);
  }

  @Put(':id')
  @SuccessMessage('Room updated')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a room (admin only)' })
  @ApiParam({ name: 'id', type: Number, description: 'Room ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'The updated room',
    schema: roomSchema,
  })
  @ApiResponse(
    errorResponse(
      400,
      'Invalid ID or body',
      'Validation failed (numeric string is expected)',
      'Bad Request',
    ),
  )
  @ApiResponse(
    errorResponse(
      403,
      'Admin role required',
      'Forbidden resource',
      'Forbidden',
    ),
  )
  @ApiResponse(
    errorResponse(404, 'Room not found', 'Room 99 not found', 'Not Found'),
  )
  @CommonErrors()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoomDto: UpdateRoomDto,
  ) {
    return this.roomsService.update(id, updateRoomDto);
  }

  @Post(':id/image')
  @SuccessMessage('Room image uploaded')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file', roomImageUploadOptions))
  @ApiOperation({
    summary: 'Upload an image for a room (admin only)',
    description: 'multipart/form-data, field "file", JPEG/PNG/WebP, max 2 MB.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiParam({ name: 'id', type: Number, description: 'Room ID', example: 1 })
  @ApiResponse({
    status: 201,
    description: 'The room with its new image_url',
    schema: roomSchema,
  })
  @ApiResponse(
    errorResponse(
      400,
      'No file, or not a JPEG/PNG/WebP image',
      'Only JPEG, PNG or WebP images are allowed',
      'Bad Request',
    ),
  )
  @ApiResponse(
    errorResponse(
      403,
      'Admin role required',
      'Forbidden resource',
      'Forbidden',
    ),
  )
  @ApiResponse(
    errorResponse(404, 'Room not found', 'Room 99 not found', 'Not Found'),
  )
  @ApiResponse(
    errorResponse(
      413,
      'File larger than 2 MB',
      'File too large',
      'Payload Too Large',
    ),
  )
  @CommonErrors()
  uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file?: { filename: string; path: string; mimetype: string  },
  ) {
    if (!file) {
      throw new BadRequestException(
        'An image file is required (form field "file")',
      );
    }
    assertRealImage(file);
    return this.roomsService.setImage(
      id,
      `${ROOM_IMAGE_URL_PREFIX}${file.filename}`,
    );
  }

  @Delete(':id')
  @SuccessMessage('Room deleted')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a room (admin only)' })
  @ApiParam({ name: 'id', type: Number, description: 'Room ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'The deleted room',
    schema: roomSchema,
  })
  @ApiResponse(
    errorResponse(
      400,
      'ID is not a number',
      'Validation failed (numeric string is expected)',
      'Bad Request',
    ),
  )
  @ApiResponse(
    errorResponse(
      403,
      'Admin role required',
      'Forbidden resource',
      'Forbidden',
    ),
  )
  @ApiResponse(
    errorResponse(404, 'Room not found', 'Room 99 not found', 'Not Found'),
  )
  @CommonErrors()
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.roomsService.remove(id);
  }

  @Patch(':id/disable')
  @SuccessMessage('Room disabled')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Disable a room (admin only)' })
  @ApiParam({ name: 'id', type: Number, description: 'Room ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Room disabled (is_active is now false)',
    schema: {
      ...roomSchema,
      properties: {
        ...roomSchema.properties,
        is_active: { type: 'boolean', example: false },
      },
    },
  })
  @ApiResponse(
    errorResponse(
      400,
      'ID is not a number',
      'Validation failed (numeric string is expected)',
      'Bad Request',
    ),
  )
  @ApiResponse(
    errorResponse(
      403,
      'Admin role required',
      'Forbidden resource',
      'Forbidden',
    ),
  )
  @ApiResponse(
    errorResponse(404, 'Room not found', 'Room 99 not found', 'Not Found'),
  )
  @CommonErrors()
  disable(@Param('id', ParseIntPipe) id: number) {
    return this.roomsService.disable(id);
  }

  @Patch(':id/enable')
  @SuccessMessage('Room enabled')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Enable a room (admin only)' })
  @ApiParam({ name: 'id', type: Number, description: 'Room ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Room enabled (is_active is now true)',
    schema: roomSchema,
  })
  @ApiResponse(
    errorResponse(
      400,
      'ID is not a number',
      'Validation failed (numeric string is expected)',
      'Bad Request',
    ),
  )
  @ApiResponse(
    errorResponse(
      403,
      'Admin role required',
      'Forbidden resource',
      'Forbidden',
    ),
  )
  @ApiResponse(
    errorResponse(404, 'Room not found', 'Room 99 not found', 'Not Found'),
  )
  @CommonErrors()
  enable(@Param('id', ParseIntPipe) id: number) {
    return this.roomsService.enable(id);
  }
}
