export class CreateNotificationDto {
  message: string;
  tag: string;
  userId: number;
  metadata?: object;
}
