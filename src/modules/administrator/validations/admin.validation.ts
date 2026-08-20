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

export const BroadcastNotificationValidation = Joi.object().keys({
  message: Joi.string().trim().min(1).max(500).required().label("Message"),
  // Optional so clients that only send a message keep working. The fallback
  // lives in broadcastToAll — JoiValidationPipe returns the raw body, so a
  // Joi .default() here would never reach the service.
  tag: Joi.string().trim().min(1).max(255).label("Tag"),
  audience: Joi.string()
    .valid("all", "verified", "unverified")
    .label("Audience"),
});

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
