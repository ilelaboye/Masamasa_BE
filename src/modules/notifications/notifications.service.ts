import { UserRequest } from "@/definitions";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, QueryRunner, Repository } from "typeorm";
import { CreateNotificationDto } from "./dto/create-notification.dto";
import { Notification } from "./entities/notification.entity";
import { User } from "@/modules/users/entities/user.entity";
import { getRequestQuery } from "@/core/utils";
import { generateMasamasaRef, paginate } from "@/core/helpers";
import { PushService } from "./push.service";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly pushService: PushService,
  ) {}

  async create(
    createNotificationDto: CreateNotificationDto,
    queryRunner?: QueryRunner,
  ) {
    // pushTitle is a delivery instruction, not a stored field — kept out of
    // the entity payload.
    const { metadata, pushTitle, ...fields } = createNotificationDto;

    if (queryRunner) {
      queryRunner.manager.save(Notification, {
        ...fields,
        user: { id: createNotificationDto.userId },
        metadata: metadata ? metadata : {},
      });
    } else {
      const notification = this.notificationRepository.create({
        ...fields,
        user: { id: createNotificationDto.userId },
        metadata: metadata ? metadata : {},
      });

      await this.notificationRepository.save(notification);
    }

    if (pushTitle) {
      await this.sendPush(createNotificationDto, pushTitle);
    }
  }

  /**
   * Device pop-up for a notification that was just recorded. Best-effort by
   * design: the stored row is the source of truth, so a user without a
   * registered device, an expired token, or an FCM outage must never surface
   * as a failed deposit or withdrawal. Callers commonly do not await create().
   */
  private async sendPush(
    createNotificationDto: CreateNotificationDto,
    pushTitle: string,
  ) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: createNotificationDto.userId },
        select: ["id", "notification_token"],
      });
      if (!user?.notification_token) return;

      await this.pushService.sendToTokens(
        [user.notification_token],
        pushTitle,
        createNotificationDto.message,
        { tag: createNotificationDto.tag },
      );
    } catch (err) {
      this.logger.warn(
        `Push notification failed for user ${createNotificationDto.userId}: ${(err as Error).message}`,
      );
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
    const users = await this.userRepository.find({
      select: ["id", "notification_token"],
    });

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

    // Best-effort device push — DB rows above are the source of truth, so a
    // push failure must not fail the broadcast.
    const tokens = users.map((u) => u.notification_token).filter(Boolean);
    const delivered = await this.pushService.sendToTokens(
      tokens,
      "MasaMasa",
      message,
      { tag: "announcement", broadcast_ref: broadcastRef },
    );

    return {
      message: `Notification sent to ${users.length} user(s), push delivered to ${delivered} device(s).`,
    };
  }

  async updateBroadcast(
    broadcastRef: string,
    message: string,
    adminId: number,
  ) {
    const recipients = await this.notificationRepository
      .createQueryBuilder("n")
      .where("n.tag = :tag", { tag: "announcement" })
      .andWhere("n.metadata->>'broadcast_ref' = :ref", { ref: broadcastRef })
      .getCount();

    if (!recipients) {
      throw new BadRequestException("Broadcast not found");
    }

    await this.notificationRepository.query(
      `UPDATE notifications
          SET message = $1,
              metadata = (
                COALESCE(metadata::jsonb, '{}'::jsonb) || jsonb_build_object(
                  'edited_at', now(),
                  'edited_by', $2::int,
                  'original_message', COALESCE(metadata->>'original_message', message)
                )
              )::json
        WHERE tag = 'announcement'
          AND metadata->>'broadcast_ref' = $3`,
      [message, adminId, broadcastRef],
    );

    return {
      message: `Broadcast updated for ${recipients} user(s). Devices that already received the push keep the original text.`,
    };
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
      .addSelect("MAX(n.metadata->>'edited_at')", "edited_at")
      .addSelect("MAX(n.metadata->>'edited_by')", "edited_by")
      .addSelect("MIN(n.metadata->>'original_message')", "original_message")
      .where("n.tag = :tag", { tag: "announcement" })
      .groupBy("n.metadata->>'broadcast_ref'")
      .addGroupBy("n.message")
      .orderBy("MIN(n.created_at)", "DESC")
      .limit(200)
      .getRawMany();
  }
}
