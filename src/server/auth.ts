import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { environment } from "./environment";
export const COOKIE = "reading_room_auth";
export const TTL = 60 * 60 * 24 * 30;
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function checkPassword(password: string) {
  if (password.length < 1 || password.length > 256) return false;
  const [salt, hash] = (process.env.APP_PASSWORD_HASH || "").split(":");
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64),
    expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function signature(body: string) {
  return createHmac("sha256", process.env.AUTH_SECRET!)
    .update(body + ":" + process.env.APP_PASSWORD_HASH)
    .digest("base64url");
}
export function signSession(now = Date.now()) {
  environment();
  const body = `${Math.floor(now / 1000) + TTL}.${randomBytes(16).toString("hex")}`;
  return `${body}.${signature(body)}`;
}
export function validSession(token: string | undefined, now = Date.now()) {
  try {
    const cfg = environment();
    if (!cfg.auth) return true;
    if (!token || token.length > 256) return false;
    const [expires, nonce, sig, ...rest] = token.split(".");
    if (rest.length || !/^\d+$/.test(expires) || !nonce || !sig) return false;
    const exp = Number(expires),
      current = Math.floor(now / 1000);
    if (exp <= current || exp > current + TTL) return false;
    const expected = Buffer.from(signature(`${expires}.${nonce}`)),
      actual = Buffer.from(sig);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}
export function requestAuthorized(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  return validSession(cookie);
}
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === environment().appUrl;
}
export function cookieOptions() {
  const cfg = environment();
  return {
    httpOnly: true,
    secure: cfg.production || cfg.appUrl.startsWith("https:"),
    sameSite: "strict" as const,
    path: "/",
    maxAge: TTL,
  };
}
