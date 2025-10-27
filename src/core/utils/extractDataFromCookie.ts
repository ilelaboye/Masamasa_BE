import { _ADMIN_AUTH_COOKIE_NAME_, _AUTH_COOKIE_NAME_ } from "@/constants";
import {
  AdminRequest,
  iAdminCookieData,
  iCookieData,
  UserRequest,
} from "@/definitions";
import { NotAcceptableException, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { Crypto } from "../lib";

export function getUserCookieData(userEmail: string, req: UserRequest) {
  const cookieData: string = req.cookies[_AUTH_COOKIE_NAME_];
  if (!cookieData) return null;

  const raw = Crypto.decrypt(cookieData);
  const { user } = JSON.parse(
    decodeURIComponent(raw)
  ) as unknown as iCookieData;

  if (!user) return null;

  return user.email == userEmail ? user : null;
}

export function extractDataFromCookie(request: Request): iCookieData {
  const cookieData: string = request.cookies[_AUTH_COOKIE_NAME_];

  if (!cookieData) throw new UnauthorizedException("You are unauthenticated");

  const { user, token } = decryptData(cookieData) as unknown as iCookieData;

  if (!token) throw new NotAcceptableException("You are not logged in!");
  if (!user) throw new NotAcceptableException("No user account found!");

  return { token, user };
}

export function encryptData(data) {
  var encode = encodeURIComponent(JSON.stringify(data));
  return Crypto.encrypt(encode);
}

export function decryptData(data) {
  const decrypt = Crypto.decrypt(data);
  return JSON.parse(decodeURIComponent(decrypt));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractUserForCookie(user: any) {
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    phone: user.phone,
    country: user.country,
    address: user.address,
    state: user.state,
    city: user.city,
  };
}

export function extractAdminForCookie(admin: any) {
  return {
    id: admin.id,
    status: admin.status,
    first_name: admin.first_name,
    last_name: admin.last_name,
    email: admin.email,
    address: admin.address,
    phone: admin.phone,
    last_seen: admin.last_seen,
    deleted_at: admin.deleted_at,
    created_at: admin.created_at,
    updated_at: admin.updated_at,
  };
}

export function getAdminCookieData(email: string, req: AdminRequest) {
  const cookieData: string = req.cookies[_ADMIN_AUTH_COOKIE_NAME_];
  if (!cookieData) return null;

  const { admin } = JSON.parse(
    decodeURIComponent(cookieData)
  ) as unknown as iAdminCookieData;
  if (!admin) return null;

  return admin.email == email ? admin : null;
}

export function extractAdminDataFromCookie(request: Request): iAdminCookieData {
  const cookieData: string = request.cookies[_ADMIN_AUTH_COOKIE_NAME_];

  if (!cookieData) throw new UnauthorizedException("You are unauthenticated");
  const { token, admin } = JSON.parse(
    decodeURIComponent(cookieData)
  ) as unknown as iAdminCookieData;

  if (!token) throw new NotAcceptableException("You are not logged in!");
  if (!admin)
    throw new NotAcceptableException(
      "No admin account is associated with this user!"
    );

  return { token, admin };
}
