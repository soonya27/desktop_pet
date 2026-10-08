import { BrowserWindow, ipcMain } from "electron";
import {
  IPC,
  type DragMovePayload,
  type DragStartPayload,
  type Point,
  type ReminderAckPayload,
} from "../shared/ipc";
import { REMINDER_KINDS } from "../shared/types";
import type { DragCoordinator } from "./drag";
import type { ReminderEngine } from "./reminders";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPoint(value: unknown): value is Point {
  return isRecord(value) && typeof value.x === "number" && typeof value.y === "number";
}

function isAckPayload(value: unknown): value is ReminderAckPayload {
  if (!isRecord(value)) return false;
  const kindOk =
    typeof value.kind === "string" && (REMINDER_KINDS as readonly string[]).includes(value.kind);
  const snoozeOk = value.snoozeMin === undefined || typeof value.snoozeMin === "number";
  return kindOk && snoozeOk;
}

function isDragStart(value: unknown): value is DragStartPayload {
  return isRecord(value) && isPoint(value.pointer) && isPoint(value.grabOffset);
}

function isDragMove(value: unknown): value is DragMovePayload {
  return isRecord(value) && isPoint(value.pointer);
}

export function registerIpc(engine: ReminderEngine, drag: DragCoordinator): void {
  ipcMain.on(IPC.setIgnoreMouse, (event, ignore: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (typeof ignore !== "boolean" || !win || win.isDestroyed()) return;
    if (ignore) win.setIgnoreMouseEvents(true, { forward: true });
    else win.setIgnoreMouseEvents(false);
  });

  ipcMain.on(IPC.reminderAck, (_event, payload: unknown) => {
    if (isAckPayload(payload)) engine.ack(payload);
  });

  ipcMain.on(IPC.dragStart, (event, payload: unknown) => {
    if (isDragStart(payload)) drag.start(event.sender, payload);
  });
  ipcMain.on(IPC.dragMove, (event, payload: unknown) => {
    if (isDragMove(payload)) drag.move(event.sender, payload);
  });
  ipcMain.on(IPC.dragEnd, (event) => drag.end(event.sender));
}
