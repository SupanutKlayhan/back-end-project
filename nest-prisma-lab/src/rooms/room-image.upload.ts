import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readSync, unlinkSync } from 'node:fs';
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

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const SIGNATURES: Record<string, (head: Buffer) => boolean> = {
  'image/jpeg': (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff,
  'image/png': (h) => h.subarray(0, 8).equals(PNG),
  'image/webp': (h) =>
    h.toString('ascii', 0, 4) === 'RIFF' &&
    h.toString('ascii', 8, 12) === 'WEBP',
};

export function assertRealImage(file: { path: string; mimetype: string }) {
  const head = Buffer.alloc(12);
  const fd = openSync(file.path, 'r');
  try {
    readSync(fd, head, 0, 12, 0);
  } finally {
    closeSync(fd);
  }
  if (!SIGNATURES[file.mimetype]?.(head)) {
    unlinkSync(file.path);
    throw new BadRequestException(
      'File content is not a JPEG, PNG or WebP image',
    );
  }
}