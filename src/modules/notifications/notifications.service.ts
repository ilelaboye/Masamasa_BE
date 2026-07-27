import { UserRequest } from "@/definitions";
import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, QueryRunner, Repository } from "typeorm";
import { CreateNotificationDto } from "./dto/create-notification.dto";
import { Notification } from "./entities/notification.entity";
import { User } from "@/modules/users/entities/user.entity";
import { getRequestQuery } from "@/core/utils";
import { generateMasamasaRef, paginate } from "@/core/helpers";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(
    createNotificationDto: CreateNotificationDto,
    queryRunner?: QueryRunner,
  ) {
    const { metadata } = createNotificationDto;

    if (queryRunner) {
      queryRunner.manager.save(Notification, {
        ...createNotificationDto,
        user: { id: createNotificationDto.userId },
        metadata: metadata ? metadata : {},
      });
    } else {
      const notification = this.notificationRepository.create({
        ...createNotificationDto,
        user: { id: createNotificationDto.userId },
        metadata: metadata ? metadata : {},
      });

      await this.notificationRepository.save(notification);
    }
  }

  async findAll(req: UserRequest) {
    // return await this.notificationRepository.find({
    //   where: { user: { id: userId } },
    //   order: { created_at: "DESC" },
    // });

    const { limit, page, skip } = getRequestQuery(req);
    const queryRunner = this.notificationRepository
      .createQueryBuilder("notification")
      .where("user_id = :user_id", { user_id: req.user.id })
      .orderBy("notification.created_at", "DESC");

    const count = await queryRunner.getCount();
    const notifications = await queryRunner.skip(skip).take(limit).getMany();

    const metadata = paginate(count, page, limit);
    return { notifications, metadata };
  }

  async findOne(id: number, req: UserRequest) {
    const { id: userId } = req.user;

    return await this.notificationRepository.findOne({
      where: { id, user: { id: userId } },
    });
  }

  async markAllAsRead(req: UserRequest) {
    await this.notificationRepository.update(
      { user_id: req.user.id, is_read: false },
      { is_read: true },
    );
    return { message: "All notifications marked as read." };
  }

  /**
   * Admin broadcast — creates one notification per user with the given
   * message. Inserted in chunks to keep a single statement from ballooning.
   */
  async broadcastToAll(message: string, adminId: number) {
    const users = await this.userRepository.find({ select: ["id"] });

    // One shared ref per broadcast so the per-user rows can be grouped back
    // into a single entry in the admin history.
    const broadcastRef = generateMasamasaRef();

    const chunkSize = 500;
    for (let i = 0; i < users.length; i += chunkSize) {
      const chunk = users.slice(i, i + chunkSize).map((user) =>
        this.notificationRepository.create({
          user_id: user.id,
          message,
          tag: "announcement",
          metadata: { sent_by_admin: adminId, broadcast_ref: broadcastRef },
        }),
      );
      await this.notificationRepository.insert(chunk);
    }

    return { message: `Notification sent to ${users.length} user(s).` };
  }

  /**
   * Admin history — one row per broadcast (grouped by the shared ref),
   * with the recipient count and send time.
   */
  async listBroadcasts() {
    return await this.notificationRepository
      .createQueryBuilder("n")
      .select("n.metadata->>'broadcast_ref'", "broadcast_ref")
      .addSelect("n.message", "message")
      .addSelect("MIN(n.created_at)", "created_at")
      .addSelect("COUNT(*)", "recipients")
      .addSelect("MIN(n.metadata->>'sent_by_admin')", "sent_by_admin")
      .where("n.tag = :tag", { tag: "announcement" })
      .groupBy("n.metadata->>'broadcast_ref'")
      .addGroupBy("n.message")
      .orderBy("MIN(n.created_at)", "DESC")
      .limit(200)
      .getRawMany();
  }
}
