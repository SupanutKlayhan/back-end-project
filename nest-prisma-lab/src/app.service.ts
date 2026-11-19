import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo() {
    return {
      name: 'Hotel Booking REST API',
      docs: '/api-docs',
      openapi_json: '/api-docs-json',
      health: '/health',
    };
  }
}
