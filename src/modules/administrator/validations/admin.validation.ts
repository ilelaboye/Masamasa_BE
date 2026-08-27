import { CurrencyCoin } from "@/modules/exchange-rates/exchange-rates.entity";
import * as Joi from "joi";
import {
  AdministratorRoles,
  AdminStatus,
} from "../entities/administrator.entity";

export const CreateUpdateExchangeRateValidation = Joi.object().keys({
  rate: Joi.number().required(),
  currency: Joi.string()
    .valid(...Object.values(CurrencyCoin))
    .required(),
});

// Absent means send now. The cron releases on the hour, so an off-the-hour
// time is rejected rather than silently shifted to the next one.
const scheduledFor = Joi.string()
  .isoDate()
  .custom((value, helpers) => {
    const date = new Date(value);
    if (date.getUTCMinutes() !== 0 || date.getUTCSeconds() !== 0)
      return helpers.error("date.notOnTheHour");
    if (date.getTime() <= Date.now()) return helpers.error("date.inThePast");
    return value;
  })
  .messages({
    "string.isoDate": "Please select a valid date and time",
    "date.notOnTheHour":
      "Notifications can only be scheduled on the hour, like 2:00 PM or 3:00 PM",
    "date.inThePast": "Please select a date and time in the future",
  })
  .label("Scheduled for");

export const BroadcastNotificationValidation = Joi.object().keys({
  message: Joi.string().trim().min(1).max(500).required().label("Message"),

  tag: Joi.string().trim().min(1).max(255).label("Tag"),
  audience: Joi.string()
    .valid("all", "verified", "unverified")
    .label("Audience"),
  scheduled_for: scheduledFor,
});

export const ReprocessTransactionValidation = Joi.object().keys({
  // Capped so one call cannot walk the whole withdrawal table; each id costs
  // a row lock and a balance aggregate.
  transaction_ids: Joi.array()
    .items(Joi.number().integer().positive().required())
    .min(1)
    .max(50)
    .unique()
    .required()
    .label("Transaction ids"),
});

// Audience is deliberately absent: changing it would mean adding or removing
// per-user rows, not editing the ones that exist. Cancel and recreate instead.
export const UpdateScheduledBroadcastValidation = Joi.object()
  .keys({
    message: Joi.string().trim().min(1).max(500).label("Message"),
    tag: Joi.string().trim().min(1).max(255).label("Tag"),
    scheduled_for: scheduledFor,
  })
  .min(1)
  .messages({ "object.min": "Provide at least one field to update" });

export const UpdateUserStatusValidation = Joi.object().keys({
  status: Joi.string()
    .valid("active", "deactivated")
    .required()
    .label("Status"),
});

export const ChangeAdminPasswordValidation = Joi.object().keys({
  old_password: Joi.string().required().label("Old password"),
  new_password: Joi.string()
    .min(6)
    .max(32)
    .required()
    .invalid(Joi.ref("old_password"))
    .messages({
      "any.invalid": "New password must be different from the old password",
    })
    .label("New password"),
});

export const CreateStaffValidation = Joi.object().keys({
  first_name: Joi.string().trim().min(1).max(50).required().label("First name"),
  last_name: Joi.string().trim().min(1).max(50).required().label("Last name"),
  email: Joi.string().trim().lowercase().email().required().label("Email"),
  // Deliberately narrower than AdministratorRoles: the invite flow must never
  // be able to mint a super_admin. Promoting someone is a manual DB change.
  role: Joi.string()
    .valid(AdministratorRoles.marketer)
    .required()
    .label("Role"),
});

export const UpdateStaffStatusValidation = Joi.object().keys({
  status: Joi.string()
    .valid(AdminStatus.active, AdminStatus.suspend)
    .required()
    .label("Status"),
});

export const AcceptStaffInviteValidation = Joi.object().keys({
  token: Joi.string().trim().required().label("Invite token"),
  password: Joi.string().min(6).max(32).required().label("Password"),
  phone: Joi.string().trim().min(7).max(50).required().label("Phone"),
});

export const UpdateAdminProfileValidation = Joi.object().keys({
  first_name: Joi.string().trim().min(1).max(50).required().label("First name"),
  last_name: Joi.string().trim().min(1).max(50).required().label("Last name"),
  phone: Joi.string().trim().max(50).required().label("Phone"),
  address: Joi.string()
    .trim()
    .max(255)
    .optional()
    .allow(null, "")
    .label("Address"),
});
