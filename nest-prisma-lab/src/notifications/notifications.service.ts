import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: number, query: ListNotificationsQueryDto) {
    const where: Prisma.notificationsWhereInput = {
      user_id: userId,
      ...(query.unread && { read_at: null }),
    };
    const [data, total] = await Promise.all([
      this.prisma.notifications.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.notifications.count({ where }),
    ]);
    return paginated(data, total, query.page, query.limit);
  }

  async markRead(userId: number, id: number) {
    const notification = await this.prisma.notifications.findFirst({
      where: { id, user_id: userId },
    });
    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    if (notification.read_at) {
      return notification;
    }
    return this.prisma.notifications.update({
      where: { id },
      data: { read_at: new Date() },
    });
  }
}
