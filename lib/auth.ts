import crypto from "node:crypto";
import { cookies } from "next/headers";

export type Role = "reception" | "admin";

const COOKIE = "hack_session";
const MAX_AGE = 60 * 60 * 24; // 24h

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET ausente ou curto demais (use 32+ caracteres).");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function pinsConfigured(): boolean {
  return Boolean(process.env.ADMIN_PIN || process.env.STAFF_PIN);
}

export function roleForPin(pin: string): Role | null {
  const admin = process.env.ADMIN_PIN;
  const staff = process.env.STAFF_PIN;
  if (admin && safeEqual(pin, admin)) return "admin";
  if (staff && safeEqual(pin, staff)) return "reception";
  return null;
}

function createToken(role: Role): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${role}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined): Role | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [role, exp, sig] = parts;
  if (role !== "admin" && role !== "reception") return null;
  if (!safeEqual(sig, sign(`${role}.${exp}`))) return null;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return null;
  return role;
}

export async function getRole(): Promise<Role | null> {
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE)?.value);
}

export async function setSession(role: Role): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, createToken(role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}
