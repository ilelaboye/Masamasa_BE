import { AdminRequest, UserRequest } from "@/definitions";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Not, QueryRunner, Repository } from "typeorm";
import { CreateNotificationDto } from "./dto/create-notification.dto";
import {
  Notification,
  NotificationStatus,
} from "./entities/notification.entity";
import { KycStatus, Status, User } from "@/modules/users/entities/user.entity";
import { Administrator } from "@/modules/administrator/entities/administrator.entity";

/** Who a broadcast reaches. "verified" is KYC, the platform's own notion of a
 *  verified account — not email confirmation. */
export type BroadcastAudience = "all" | "verified" | "unverified";
import { formateDate, getRequestQuery } from "@/core/utils";
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
      .andWhere("notification.status = :sent", {
        sent: NotificationStatus.sent,
      })
      // A scheduled row is created days before it is delivered, so ordering on
      // created_at alone would bury it. COALESCE leaves immediate
      // notifications ordering exactly as before.
      .orderBy(
        "COALESCE(notification.scheduled_for, notification.created_at)",
        "DESC",
      );

    const count = await queryRunner.getCount();
    const notifications = await queryRunner.skip(skip).take(limit).getMany();

    const metadata = paginate(count, page, limit);
    return { notifications, metadata };
  }

  async findOne(id: number, req: UserRequest) {
    const { id: userId } = req.user;

    return await this.notificationRepository.findOne({
      where: { id, user: { id: userId }, status: NotificationStatus.sent },
    });
  }

  async markAllAsRead(req: UserRequest) {
    await this.notificationRepository.update(
      { user_id: req.user.id, is_read: false, status: NotificationStatus.sent },
      { is_read: true },
    );
    return { message: "All notifications marked as read." };
  }

  async broadcastToAll(
    message: string,
    adminId: number,
    tag?: string,
    audience: BroadcastAudience = "all",
    scheduledFor?: Date | null,
  ) {
    const notificationTag = tag?.trim() || "announcement";

    const broadcastRef = generateMasamasaRef();

    if (scheduledFor) {
      this.notificationRepository.create({
        user_id: 1,
        message,
        tag: notificationTag,
        scheduled_for: scheduledFor,
        status: NotificationStatus.pending,
        metadata: {
          sent_by_admin: adminId,
          broadcast_ref: broadcastRef,
          audience,
        },
      });
      return {
        message: `Notification scheduled for ${formateDate(scheduledFor)}.`,
      };
    }

    const users = await this.userRepository.find({
      select: ["id", "notification_token", "kyc_status", "status"],
      where: {
        status: Status.active,
        kyc_status:
          audience === "verified"
            ? KycStatus.success
            : audience === "unverified"
              ? KycStatus.none
              : Not(IsNull()),
      },
    });

    const chunkSize = 500;
    for (let i = 0; i < users.length; i += chunkSize) {
      const chunk = users.slice(i, i + chunkSize).map((user) =>
        this.notificationRepository.create({
          user_id: user.id,
          message,
          tag: notificationTag,
          scheduled_for: scheduledFor ?? null,
          status: scheduledFor
            ? NotificationStatus.pending
            : NotificationStatus.sent,
          metadata: {
            sent_by_admin: adminId,
            broadcast_ref: broadcastRef,
            audience,
          },
        }),
      );
      await this.notificationRepository.insert(chunk);
    }

    // Best-effort device push — DB rows above are the source of truth, so a
    // push failure must not fail the broadcast.
    const tokens = users.map((u) => u.notification_token).filter(Boolean);
    const delivered = await this.pushService.sendToTokens(
      tokens,
      notificationTag,
      `${message}`,
      { tag: notificationTag, broadcast_ref: broadcastRef },
    );

    return {
      message: `Notification sent to ${users.length} user(s), push delivered to ${delivered} device(s).`,
    };
  }

  /**
   * Admin history — one row per broadcast (grouped by the shared ref),
   * with the recipient count, send time and who sent it.
   */
  async listBroadcasts(req: AdminRequest) {
    const { limit, page, skip } = getRequestQuery(req);
    const status = req.query.status as string;

    // Every row of a broadcast is written and released in one statement, so
    // filtering at row level and the rollup in the SELECT always agree.
    const countQuery = this.notificationRepository
      .createQueryBuilder("n")
      .select("COUNT(DISTINCT n.metadata->>'broadcast_ref')", "count")
      .where("n.metadata->>'broadcast_ref' IS NOT NULL");

    if (status) countQuery.andWhere("n.status = :status", { status });

    const counted = await countQuery.getRawOne<{ count: string }>();

    const query = this.notificationRepository
      .createQueryBuilder("n")
      .withDeleted()
      .leftJoin(
        Administrator,
        "admin",
        "n.metadata->>'sent_by_admin' = CAST(admin.id AS text)",
      )
      .select("n.metadata->>'broadcast_ref'", "broadcast_ref")
      .addSelect("n.message", "message")
      .addSelect("MIN(n.metadata->>'audience')", "audience")
      .addSelect("n.tag", "tag")
      .addSelect("MIN(n.created_at)", "created_at")
      .addSelect("MIN(n.scheduled_for)", "scheduled_for")
      // Rolled up from the per-user rows: cancelled wins over pending, and a
      // broadcast only reads as sent once every one of its rows is.
      .addSelect(
        `CASE
           WHEN BOOL_OR(n.status = 'cancelled') THEN 'cancelled'
           WHEN BOOL_OR(n.status = 'pending') THEN 'pending'
           ELSE 'sent'
         END`,
        "status",
      )
      .addSelect("COUNT(*)", "recipients")
      .addSelect("MIN(n.metadata->>'sent_by_admin')", "sent_by_admin")
      // Aggregated rather than grouped on, so a broadcast stays one row even if
      // its rows somehow disagree about the sender. NULLIF collapses the
      // " " that CONCAT leaves behind when an admin has no name on record.
      .addSelect(
        "MIN(NULLIF(TRIM(CONCAT(admin.first_name, ' ', admin.last_name)), ''))",
        "sent_by_name",
      )
      .addSelect("MIN(admin.email)", "sent_by_email")
      // Keyed off the shared ref, not the tag: the tag is caller-supplied now,
      // so filtering on "announcement" would hide every custom category.
      .where("n.metadata->>'broadcast_ref' IS NOT NULL")
      .groupBy("n.metadata->>'broadcast_ref'")
      .addGroupBy("n.message")
      .addGroupBy("n.tag")
      // Newest-created first. Deliberately not scheduled_for — the admin list
      // reads as a history of what was sent out, so a broadcast stays where it
      // was created regardless of when it is due to fire.
      .orderBy("MIN(n.created_at)", "DESC")
      .limit(limit)
      .offset(skip);

    if (status) query.andWhere("n.status = :status", { status });

    const notifications = await query.getRawMany();

    return {
      notifications,
      metadata: paginate(Number(counted?.count) || 0, page, limit),
    };
  }

  /**
   * Releases scheduled notifications whose hour has arrived, then pushes them.
   * Driven by the hourly cron.
   *
   * A row is deliverable from its scheduled hour until the end of that hour
   * (2:00pm–2:59pm for a 2pm schedule). Anything past that stays unsent rather
   * than arriving late, and remains visible in the admin list as such.
   */
  async releaseScheduleNotifications() {
    const result = await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ status: NotificationStatus.sent })
      .where("status = :pending", { pending: NotificationStatus.pending })
      .andWhere(`scheduled_for <= now() + interval '1 minute'`)
      .andWhere(`now() < scheduled_for + interval '1 hour'`)
      .returning(["id", "user_id", "message", "tag", "metadata"])
      .execute();

    const released = (result.raw ?? []) as Array<{
      id: number;
      user_id: number;
      message: string;
      tag: string;
      metadata: { broadcast_ref?: string } | null;
    }>;

    if (!released.length) return { released: 0, delivered: 0 };
    const groups = new Map<
      string,
      { message: string; tag: string; userIds: number[] }
    >();
    for (const row of released) {
      const key = row.metadata?.broadcast_ref ?? `single-${row.id}`;
      const group = groups.get(key) ?? {
        message: row.message,
        tag: row.tag,
        userIds: [],
      };
      group.userIds.push(row.user_id);
      groups.set(key, group);
    }

    const users = await this.userRepository.find({
      select: ["id", "notification_token"],
      where: { id: In(released.map((row) => row.user_id)) },
    });
    const tokenByUserId = new Map(
      users.map((user) => [user.id, user.notification_token]),
    );

    let delivered = 0;
    for (const [ref, group] of groups) {
      const tokens = group.userIds
        .map((id) => tokenByUserId.get(id))
        .filter(Boolean) as string[];

      delivered += await this.pushService.sendToTokens(
        tokens,
        group.tag,
        group.message,
        { tag: group.tag, broadcast_ref: ref },
      );
    }

    this.logger.log(
      `Released ${released.length} scheduled notification(s), push delivered to ${delivered} device(s).`,
    );

    return { released: released.length, delivered };
  }

  /**
   * Edits a scheduled broadcast before it goes out. Every per-user row sharing
   * the ref is updated together, since the broadcast only exists as those rows.
   */
  async updateScheduledBroadcast(
    ref: string,
    message?: string,
    tag?: string,
    scheduledFor?: Date,
  ) {
    await this.assertPendingBroadcast(ref);

    // Only the fields the admin actually sent get overwritten.
    const fields = {
      ...(message !== undefined ? { message: message.trim() } : {}),
      ...(tag !== undefined ? { tag: tag.trim() || "announcement" } : {}),
      ...(scheduledFor !== undefined ? { scheduled_for: scheduledFor } : {}),
    };

    const result = await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set(fields)
      .where("metadata->>'broadcast_ref' = :ref", { ref })
      .andWhere("status = :pending", { pending: NotificationStatus.pending })
      .execute();

    return {
      message: `Scheduled notification updated for ${result.affected ?? 0} user(s).`,
    };
  }

  /**
   * Cancels a scheduled broadcast. The rows are kept and marked cancelled
   * rather than deleted, so the broadcast stays visible in the admin list —
   * and `status = 'pending'` in the cron query excludes them on its own.
   */
  async cancelScheduledBroadcast(ref: string) {
    await this.assertPendingBroadcast(ref);

    const result = await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ status: NotificationStatus.cancelled })
      .where("metadata->>'broadcast_ref' = :ref", { ref })
      .andWhere("status = :pending", { pending: NotificationStatus.pending })
      .execute();

    return {
      message: `Scheduled notification cancelled for ${result.affected ?? 0} user(s).`,
    };
  }

  /** A broadcast can only be changed while every one of its rows is pending. */
  private async assertPendingBroadcast(ref: string) {
    const rows = await this.notificationRepository
      .createQueryBuilder("n")
      .select("n.status", "status")
      .where("n.metadata->>'broadcast_ref' = :ref", { ref })
      .groupBy("n.status")
      .getRawMany<{ status: NotificationStatus }>();

    if (!rows.length)
      throw new NotFoundException("Scheduled notification not found");

    const blocking = rows
      .map((row) => row.status)
      .find((status) => status !== NotificationStatus.pending);

    if (blocking)
      throw new BadRequestException(
        `This notification has already been ${blocking} and can no longer be changed`,
      );
  }
}
