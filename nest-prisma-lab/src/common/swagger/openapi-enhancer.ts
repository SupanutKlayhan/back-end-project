import type { OpenAPIObject } from '@nestjs/swagger';

const ISO = '2026-12-24T14:00:00.000Z';

const COMPONENT_SCHEMAS = {
  PageMeta: {
    type: 'object',
    properties: {
      total: {
        type: 'integer',
        example: 25,
        description: 'Items matching the filters',
      },
      page: { type: 'integer', example: 1 },
      limit: { type: 'integer', example: 10 },
      totalPages: { type: 'integer', example: 3 },
    },
  },
  ErrorResponse: {
    type: 'object',
    required: ['success', 'statusCode', 'message', 'path', 'timestamp'],
    properties: {
      success: { type: 'boolean', example: false },
      statusCode: { type: 'integer', example: 400 },
      message: { type: 'string', example: 'Validation failed' },
      errors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Only for validation errors: one entry per problem',
        example: ['capacity must be an integer number'],
      },
      path: { type: 'string', example: '/rooms' },
      timestamp: { type: 'string', format: 'date-time', example: ISO },
    },
  },
  Booking: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 12 },
      user_id: { type: 'integer', example: 2 },
      room_id: { type: 'integer', example: 1 },
      check_in: { type: 'string', format: 'date-time', example: ISO },
      check_out: {
        type: 'string',
        format: 'date-time',
        example: '2026-12-26T11:00:00.000Z',
      },
      status: {
        type: 'string',
        enum: ['PENDING', 'APPROVED', 'CANCELLED', 'PAID'],
        example: 'PENDING',
      },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
      room: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Deluxe Ocean View' },
          price_per_night: { type: 'string', example: '1500.50' },
        },
      },
    },
  },
  Notification: {
    type: 'object',
    properties: {
      id: { type: 'integer', example: 5 },
      user_id: { type: 'integer', example: 2 },
      booking_id: { type: 'integer', example: 12 },
      type: {
        type: 'string',
        enum: ['BOOKING_CREATED', 'BOOKING_CANCELLED'],
        example: 'BOOKING_CREATED',
      },
      message: {
        type: 'string',
        example:
          'Booking #12 for "Deluxe Ocean View" was created and is pending approval',
      },
      read_at: {
        type: 'string',
        format: 'date-time',
        nullable: true,
        example: null,
      },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  UserProfile: {
    type: 'object',
    description: 'Never contains the password',
    properties: {
      id: { type: 'integer', example: 2 },
      name: { type: 'string', example: 'Ann Smith' },
      email: { type: 'string', format: 'email', example: 'user@example.com' },
      role: { type: 'string', enum: ['USER', 'ADMIN'], example: 'USER' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
  Token: {
    type: 'object',
    properties: {
      access_token: {
        type: 'string',
        description:
          'JWT, valid for 1 hour. Send as "Authorization: Bearer <token>"',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  },
};

type Json = Record<string, any>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const page = (name: string) => ({
  type: 'object',
  properties: {
    data: { type: 'array', items: ref(name) },
    meta: ref('PageMeta'),
  },
});

const FALLBACK_BODY: Record<string, Json | null> = {
  'post /auth/register': ref('UserProfile'),
  'post /auth/login': ref('Token'),
  'post /auth/logout': null,
  'get /users/me': ref('UserProfile'),
  'patch /users/me': ref('UserProfile'),
  'post /bookings': ref('Booking'),
  'get /bookings': page('Booking'),
  'get /bookings/{id}': ref('Booking'),
  'patch /bookings/{id}/cancel': ref('Booking'),
  'patch /bookings/{id}/status': ref('Booking'),
  'get /notifications': page('Notification'),
  'patch /notifications/{id}/read': ref('Notification'),
};

const DEFAULT_MESSAGE: Record<string, string> = {
  get: 'Request successful',
  post: 'Created successfully',
  put: 'Updated successfully',
  patch: 'Updated successfully',
  delete: 'Deleted successfully',
};

function successSchema(body: Json | null | undefined, message: string): Json {
  const isPage = body?.properties?.data && body?.properties?.meta && !body.$ref;
  return {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: message },
      data: isPage
        ? body!.properties!.data
        : (body ?? { nullable: true, example: null }),
      ...(isPage && { meta: body!.properties!.meta }),
    },
  };
}

function errorExample(status: number, original: Json | undefined): Json {
  const props = original?.properties ?? {};
  const msg = props.message?.example;
  const isValidation = Array.isArray(msg);
  return {
    success: false,
    statusCode: status,
    message: isValidation ? 'Validation failed' : (msg ?? 'Error'),
    ...(isValidation && { errors: msg }),
    path: '/example',
    timestamp: ISO,
  };
}

export function enhanceOpenApi(document: OpenAPIObject): OpenAPIObject {
  const doc = document as unknown as Json;
  doc.components ??= {};
  doc.components.schemas = { ...doc.components.schemas, ...COMPONENT_SCHEMAS };

  for (const [path, item] of Object.entries<Json>(doc.paths ?? {})) {
    if (path === '/health') continue;
    for (const [method, op] of Object.entries<Json>(item)) {
      if (!op?.responses) continue;
      const key = `${method} ${path}`;
      const message: string =
        op['x-success-message'] ??
        DEFAULT_MESSAGE[method] ??
        'Request successful';
      delete op['x-success-message'];

      if (!op.security?.length && path !== '/auth/login') {
        delete op.responses['401'];
      }

      for (const [code, response] of Object.entries<Json>(op.responses)) {
        const status = Number(code);
        const original = response.content?.['application/json']?.schema as
          Json | undefined;
        if (status >= 200 && status < 300) {
          const body = original ?? FALLBACK_BODY[key];
          response.content = {
            'application/json': { schema: successSchema(body, message) },
          };
        } else if (status >= 400) {
          response.content = {
            'application/json': {
              schema: ref('ErrorResponse'),
              example: errorExample(status, original),
            },
          };
        }
      }
    }
  }
  return document;
}
