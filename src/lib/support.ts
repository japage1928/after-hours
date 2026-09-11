import { z } from "zod";

export const SUPPORT_CATEGORY_IDS = [
  "login",
  "billing",
  "remix",
  "mashup",
  "other",
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORY_IDS)[number];

export const SUPPORT_STATUS_IDS = ["open", "resolved"] as const;

export type SupportStatus = (typeof SUPPORT_STATUS_IDS)[number];

export const SUPPORT_CATEGORIES: Record<
  SupportCategory,
  { id: SupportCategory; label: string; hint: string }
> = {
  login: {
    id: "login",
    label: "Login / password",
    hint: "Can’t sign in, reset a password, or link an account.",
  },
  billing: {
    id: "billing",
    label: "Billing",
    hint: "Plans, charges, credits, or cancel.",
  },
  remix: {
    id: "remix",
    label: "Remix failed",
    hint: "AI DJ remix didn’t finish or sounded wrong.",
  },
  mashup: {
    id: "mashup",
    label: "Mashup failed",
    hint: "Beats × lyrics mash didn’t finish or sounded wrong.",
  },
  other: {
    id: "other",
    label: "Other",
    hint: "Anything else about After Hours.",
  },
};

export const SUPPORT_CATEGORY_LIST = SUPPORT_CATEGORY_IDS.map(
  (id) => SUPPORT_CATEGORIES[id],
);

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;
export const ADMIN_NOTE_MAX = 1000;
export const MAX_OPEN_TICKETS_PER_USER = 8;

export const CreateSupportTicketSchema = z.object({
  category: z.enum(SUPPORT_CATEGORY_IDS),
  message: z
    .string()
    .trim()
    .min(MESSAGE_MIN, `Write at least ${MESSAGE_MIN} characters.`)
    .max(MESSAGE_MAX, `Keep it under ${MESSAGE_MAX} characters.`),
});

export const AdminUpdateTicketSchema = z
  .object({
    ticketId: z.string().min(1),
    status: z.enum(SUPPORT_STATUS_IDS).optional(),
    adminNote: z
      .string()
      .trim()
      .max(ADMIN_NOTE_MAX, `Admin note must be under ${ADMIN_NOTE_MAX} characters.`)
      .optional()
      .nullable(),
  })
  .refine(
    (value) => value.status !== undefined || value.adminNote !== undefined,
    { message: "Provide a status or an admin note." },
  );

export function isSupportCategory(value: string): value is SupportCategory {
  return (SUPPORT_CATEGORY_IDS as readonly string[]).includes(value);
}

export function isSupportStatus(value: string): value is SupportStatus {
  return (SUPPORT_STATUS_IDS as readonly string[]).includes(value);
}

export function supportCategoryLabel(id: string): string {
  return isSupportCategory(id) ? SUPPORT_CATEGORIES[id].label : id;
}

/**
 * Allowed admin status moves: open ↔ resolved. Same-status is a no-op.
 */
export function nextSupportStatus(
  current: SupportStatus,
  requested: SupportStatus | undefined,
): SupportStatus {
  if (!requested || requested === current) return current;
  if (
    (current === "open" && requested === "resolved") ||
    (current === "resolved" && requested === "open")
  ) {
    return requested;
  }
  throw new Error(
    `Cannot change ticket status from ${current} to ${requested}.`,
  );
}

export function parseCreateSupportTicket(input: unknown) {
  return CreateSupportTicketSchema.parse(input);
}

export function parseAdminUpdateTicket(input: unknown) {
  return AdminUpdateTicketSchema.parse(input);
}
