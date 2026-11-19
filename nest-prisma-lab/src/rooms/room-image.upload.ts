import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { diskStorage } from 'multer';

export const UPLOAD_ROOT =
  process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
export const ROOM_IMAGE_DIR = join(UPLOAD_ROOT, 'rooms');
export const ROOM_IMAGE_URL_PREFIX = '/uploads/rooms/';
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const roomImageUploadOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      mkdirSync(ROOM_IMAGE_DIR, { recursive: true });
      cb(null, ROOM_IMAGE_DIR);
    },
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${EXTENSIONS[file.mimetype] ?? ''}`);
    },
  }),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb: (error: Error | null, accept: boolean) => void,
  ) => {
    if (EXTENSIONS[file.mimetype]) {
      cb(null, true);
    } else {
      cb(
        new BadRequestException('Only JPEG, PNG or WebP images are allowed'),
        false,
      );
    }
  },
};
