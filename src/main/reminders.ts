import { Notification, powerMonitor } from "electron";
import type { ReminderAckPayload, ReminderShowPayload } from "../shared/ipc";
import {
  REMINDER_KINDS,
  REMINDER_LABEL,
  REMINDER_MESSAGE,
  type ReminderKind,
} from "../shared/types";
import { getSettings } from "./settings";

/** WITHCHII_FAST=1 이면 "분"을 "초"로 취급해 빠르게 확인할 수 있다 */
const FAST = process.env.WITHCHII_FAST === "1";
const MINUTE_MS = FAST ? 1_000 : 60_000;
const TICK_MS = FAST ? 1_000 : 15_000;
const IDLE_THRESHOLD_S = 300;
/** 렌더러가 응답하지 않을 때(리로드 등) 표시 중 상태를 풀어주는 시간 */
const SHOWING_TIMEOUT_MS = 60_000;

export interface ReminderEngine {
  ack(payload: ReminderAckPayload): void;
  pause(minutes: number | null): void;
  isPaused(): boolean;
  trigger(kind: ReminderKind): void;
}

export function createReminderEngine(show: (payload: ReminderShowPayload) => void): ReminderEngine {
  const elapsedMs: Record<ReminderKind, number> = { eyeRest: 0, stretch: 0, water: 0 };
  const queue: ReminderKind[] = [];
  let pausedUntil = 0;
  let showing: ReminderKind | null = null;
  let showingSince = 0;

  function intervalMs(kind: ReminderKind): number {
    return getSettings().reminders[kind].intervalMin * MINUTE_MS;
  }

  function resetAll(): void {
    for (const kind of REMINDER_KINDS) elapsedMs[kind] = 0;
  }

  function enqueue(kind: ReminderKind): void {
    if (showing === kind || queue.includes(kind)) return;
    queue.push(kind);
  }

  function flush(): void {
    if (showing !== null && Date.now() - showingSince > SHOWING_TIMEOUT_MS) showing = null;
    if (showing !== null) return;
    const kind = queue.shift();
    if (kind === undefined) return;
    showing = kind;
    showingSince = Date.now();
    const message = REMINDER_MESSAGE[kind];
    show({ kind, message });
    if (getSettings().nativeNotification && Notification.isSupported()) {
      new Notification({ title: REMINDER_LABEL[kind], body: message, silent: false }).show();
    }
  }

  function tick(): void {
    const now = Date.now();
    if (now < pausedUntil) return;
    if (powerMonitor.getSystemIdleTime() >= IDLE_THRESHOLD_S) return;
    const settings = getSettings();
    for (const kind of REMINDER_KINDS) {
      if (!settings.reminders[kind].enabled) {
        elapsedMs[kind] = 0;
        continue;
      }
      elapsedMs[kind] += TICK_MS;
      if (elapsedMs[kind] >= intervalMs(kind)) {
        elapsedMs[kind] = 0;
        enqueue(kind);
      }
    }
    flush();
  }

  powerMonitor.on("resume", resetAll);
  powerMonitor.on("unlock-screen", resetAll);
  setInterval(tick, TICK_MS);

  return {
    ack({ kind, snoozeMin }) {
      if (showing === kind) showing = null;
      if (snoozeMin !== undefined) {
        elapsedMs[kind] = Math.max(0, intervalMs(kind) - snoozeMin * MINUTE_MS);
      }
      flush();
    },
    pause(minutes) {
      pausedUntil = minutes === null ? 0 : Date.now() + minutes * 60_000;
    },
    isPaused() {
      return Date.now() < pausedUntil;
    },
    trigger(kind) {
      enqueue(kind);
      flush();
    },
  };
}
