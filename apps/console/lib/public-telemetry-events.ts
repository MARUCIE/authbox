export const publicEventNames = [
  "PUBLIC_PAGE_VIEW",
  "PUBLIC_CTA_CLICK",
  "PUBLIC_COMPARE_CLICK",
  "ONBOARDING_ENTRY_VIEW",
  "PLATFORM_CREATE_SUCCESS"
] as const;

export type PublicEventName = (typeof publicEventNames)[number];

export function isPublicEventName(value: string): value is PublicEventName {
  return (publicEventNames as readonly string[]).includes(value);
}
