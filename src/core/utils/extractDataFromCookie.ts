import { _AUTH_COOKIE_NAME_ } from "@/constants";
import { iCookieData, UserRequest } from "@/definitions";
import { NotAcceptableException, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { Crypto } from "../lib";
import { func } from "joi";

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
  return encodeURIComponent(JSON.stringify(decrypt));
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
