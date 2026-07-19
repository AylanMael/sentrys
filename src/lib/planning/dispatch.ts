export const DISPATCH_CHANNELS = [
  "portal",
  "email",
  "whatsapp",
  "internal",
] as const;

export type DispatchChannel = (typeof DISPATCH_CHANNELS)[number];

export type DispatchDeliveryMode = "portal" | "simulation" | "log";

export type DispatchDeliveryStatus =
  | "portal_published"
  | "simulated"
  | "logged"
  | "blocked";

export function normalizeDispatchChannel(value: unknown): DispatchChannel {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "email") return "email";
  if (normalized === "whatsapp") return "whatsapp";
  if (normalized === "internal") return "internal";
  return "portal";
}

export function getDispatchDeliveryMode(
  channel: DispatchChannel
): DispatchDeliveryMode {
  if (channel === "portal") return "portal";
  if (channel === "internal") return "log";
  return "simulation";
}

export function getDispatchDeliveryStatus(
  channel: DispatchChannel
): DispatchDeliveryStatus {
  if (channel === "portal") return "portal_published";
  if (channel === "internal") return "logged";
  return "simulated";
}

export function dispatchChannelLabel(channel: DispatchChannel) {
  if (channel === "portal") return "Portail agent";
  if (channel === "email") return "Email simulé";
  if (channel === "whatsapp") return "WhatsApp simulé";
  return "Historique interne";
}

export function dispatchChannelNeedsEmail(channel: DispatchChannel) {
  return channel === "email";
}

export function dispatchChannelNeedsPhone(channel: DispatchChannel) {
  return channel === "whatsapp";
}
