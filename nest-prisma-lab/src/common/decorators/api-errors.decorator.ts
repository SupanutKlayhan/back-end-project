import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

const ERRORS: Record<number, { description: string; label: string }> = {
  400: {
    description: 'Validation failed or invalid input',
    label: 'Bad Request',
  },
  401: {
    description: 'Missing, invalid or revoked JWT',
    label: 'Unauthorized',
  },
  403: { description: 'Admin role required', label: 'Forbidden' },
  404: { description: 'Resource not found', label: 'Not Found' },
  409: { description: 'Conflict with the current state', label: 'Conflict' },
  429: { description: 'Rate limit exceeded', label: 'Too Many Requests' },
  503: { description: 'Dependency unavailable', label: 'Service Unavailable' },
};

export const ApiErrors = (...codes: number[]) =>
  applyDecorators(
    ...codes.map((status) =>
      ApiResponse({
        status,
        description: ERRORS[status].description,
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            statusCode: { type: 'integer', example: status },
            message: { type: 'string', example: ERRORS[status].label },
            errors: {
              type: 'array',
              items: { type: 'string' },
              nullable: true,
            },
            path: { type: 'string', example: '/example' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      }),
    ),
  );
