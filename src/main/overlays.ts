import { BrowserWindow, screen, type Display, type WebContents } from "electron";
import { IPC, type CharacterTakeoverPayload, type Point } from "../shared/ipc";
import { createOverlayWindow } from "./window";

/**
 * 디스플레이마다 오버레이 창 하나. 캐릭터는 한 번에 한 창(owner)에만 있다.
 * 좌표는 모두 Electron DIP 기준이라 배율이 다른 모니터 사이에서도 그대로 변환된다.
 */
export interface Overlays {
  ownerDisplayId(): number;
  displayIdOf(sender: WebContents): number | null;
  displayIdAt(screenPoint: Point): number;
  toScreen(displayId: number, local: Point): Point;
  toLocal(displayId: number, screenPoint: Point): Point;
  send(displayId: number, channel: string, payload?: unknown): void;
  sendToOwner(channel: string, payload?: unknown): void;
  setOwner(displayId: number, payload: CharacterTakeoverPayload): void;
  /** 캐릭터 숨기기/보이기 (트레이·컨텍스트 메뉴) */
  isCharacterHidden(): boolean;
  setCharacterHidden(hidden: boolean): void;
}

export function createOverlays(): Overlays {
  const windows = new Map<number, BrowserWindow>();
  let ownerId = screen.getPrimaryDisplay().id;
  let hidden = false;

  function send(displayId: number, channel: string, payload?: unknown): void {
    const win = windows.get(displayId);
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  function setOwner(displayId: number, payload: CharacterTakeoverPayload): void {
    if (!windows.has(displayId)) return;
    if (displayId !== ownerId) send(ownerId, IPC.characterRelease);
    ownerId = displayId;
    send(ownerId, IPC.characterTakeover, payload);
  }

  function add(display: Display): void {
    const win = createOverlayWindow(display.workArea);
    windows.set(display.id, win);
    // 최초 로드·리로드 시 owner 창에만 캐릭터를 띄운다
    win.webContents.on("did-finish-load", () => {
      if (display.id === ownerId && !hidden)
        send(display.id, IPC.characterTakeover, { held: false });
    });
  }

  function remove(displayId: number): void {
    const win = windows.get(displayId);
    windows.delete(displayId);
    if (win && !win.isDestroyed()) win.destroy();
    if (displayId === ownerId) {
      ownerId = screen.getPrimaryDisplay().id;
      if (!hidden) send(ownerId, IPC.characterTakeover, { held: false });
    }
  }

  for (const display of screen.getAllDisplays()) add(display);

  screen.on("display-added", (_event, display) => add(display));
  screen.on("display-removed", (_event, display) => remove(display.id));
  screen.on("display-metrics-changed", (_event, display) => {
    const win = windows.get(display.id);
    if (win && !win.isDestroyed()) win.setBounds(display.workArea);
  });

  function originOf(displayId: number): Point {
    const bounds = windows.get(displayId)?.getBounds();
    return bounds ? { x: bounds.x, y: bounds.y } : { x: 0, y: 0 };
  }

  return {
    ownerDisplayId: () => ownerId,
    displayIdOf(sender) {
      for (const [id, win] of windows) {
        if (!win.isDestroyed() && win.webContents.id === sender.id) return id;
      }
      return null;
    },
    displayIdAt(screenPoint) {
      const nearest = screen.getDisplayNearestPoint(screenPoint).id;
      return windows.has(nearest) ? nearest : ownerId;
    },
    toScreen(displayId, local) {
      const origin = originOf(displayId);
      return { x: origin.x + local.x, y: origin.y + local.y };
    },
    toLocal(displayId, screenPoint) {
      const origin = originOf(displayId);
      return { x: screenPoint.x - origin.x, y: screenPoint.y - origin.y };
    },
    send,
    sendToOwner: (channel, payload) => send(ownerId, channel, payload),
    setOwner,
    isCharacterHidden: () => hidden,
    setCharacterHidden(next) {
      if (next === hidden) return;
      hidden = next;
      if (hidden) send(ownerId, IPC.characterRelease);
      else send(ownerId, IPC.characterTakeover, { held: false });
    },
  };
}
