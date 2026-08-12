export class CreateNotificationDto {
  message: string;
  tag: string;
  userId: number;
  metadata?: object;

  /**
   * Set to also deliver this notification as a device pop-up, using this as
   * the push title (the message becomes the body). Left unset, the
   * notification is recorded in-app only.
   */
  pushTitle?: string;
}
