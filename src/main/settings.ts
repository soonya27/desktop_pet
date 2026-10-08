import { app } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  REMINDER_KINDS,
  type ReminderKind,
  type ReminderSetting,
  type Settings,
} from "../shared/types";

const DEFAULTS: Settings = {
  reminders: {
    eyeRest: { enabled: true, intervalMin: 20 },
    stretch: { enabled: true, intervalMin: 50 },
    water: { enabled: true, intervalMin: 60 },
  },
  nativeNotification: true,
  launchAtLogin: false,
  hungerEnabled: true,
};

let current: Settings = structuredClone(DEFAULTS);

function filePath(): string {
  return join(app.getPath("userData"), "settings.json");
}

function isReminderSetting(value: unknown): value is ReminderSetting {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.enabled === "boolean" && typeof v.intervalMin === "number" && v.intervalMin > 0;
}

/** 파일에 저장된 값 중 형식이 맞는 것만 기본값 위에 덮어쓴다 */
function merge(raw: unknown): Settings {
  const next = structuredClone(DEFAULTS);
  if (typeof raw !== "object" || raw === null) return next;
  const r = raw as Record<string, unknown>;
  const reminders = r.reminders;
  if (typeof reminders === "object" && reminders !== null) {
    const rr = reminders as Record<string, unknown>;
    for (const kind of REMINDER_KINDS) {
      const v = rr[kind];
      if (isReminderSetting(v))
        next.reminders[kind] = { enabled: v.enabled, intervalMin: v.intervalMin };
    }
  }
  if (typeof r.nativeNotification === "boolean") next.nativeNotification = r.nativeNotification;
  if (typeof r.launchAtLogin === "boolean") next.launchAtLogin = r.launchAtLogin;
  if (typeof r.hungerEnabled === "boolean") next.hungerEnabled = r.hungerEnabled;
  return next;
}

export function loadSettings(): Settings {
  try {
    current = merge(JSON.parse(readFileSync(filePath(), "utf8")));
  } catch {
    current = structuredClone(DEFAULTS);
  }
  return current;
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: (draft: Settings) => void): Settings {
  patch(current);
  const path = filePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(current, null, 2));
  return current;
}

export function getReminderSetting(kind: ReminderKind): ReminderSetting {
  return current.reminders[kind];
}
