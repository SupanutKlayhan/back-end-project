import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const SUCCESS_MESSAGE_KEY = 'success_message';

export const SuccessMessage = (message: string) =>
  applyDecorators(
    SetMetadata(SUCCESS_MESSAGE_KEY, message),
    ApiExtension('x-success-message', message),
  );
