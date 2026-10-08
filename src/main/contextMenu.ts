import { BrowserWindow, ipcMain, Menu } from "electron";
import { IPC, type CharacterCommand, type ContextMenuRequest } from "../shared/ipc";
import { feedItem, pauseSubmenu, settingsItems } from "./menus";
import type { Overlays } from "./overlays";
import type { PetState } from "./petState";
import type { ReminderEngine } from "./reminders";
import type { TrayController } from "./tray";

function isRequest(value: unknown): value is ContextMenuRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ContextMenuRequest).sleeping === "boolean"
  );
}

/** 캐릭터 우클릭 메뉴. 렌더러가 요청하면 그 창 위에 네이티브 메뉴를 띄운다 */
export function registerContextMenu(
  overlays: Overlays,
  engine: ReminderEngine,
  tray: TrayController,
  pet: PetState,
): void {
  ipcMain.on(IPC.characterContextMenu, (event, request: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed() || !isRequest(request)) return;
    const command = (c: CharacterCommand): void => overlays.sendToOwner(IPC.characterCommand, c);

    const menu = Menu.buildFromTemplate([
      feedItem(pet),
      {
        label: request.sleeping ? "깨우기" : "잠자기",
        click: () => command({ type: "toggleSleep" }),
      },
      pauseSubmenu(engine, tray.rebuild),
      { type: "separator" },
      { label: "설정", submenu: settingsItems(pet, tray.rebuild) },
      {
        label: "캐릭터 숨기기",
        sublabel: "메뉴바 아이콘에서 다시 보이기",
        click: () => {
          overlays.setCharacterHidden(true);
          tray.rebuild();
        },
      },
      { type: "separator" },
      { label: "withChii 종료", role: "quit" },
    ]);
    // 메뉴가 닫히면(선택·취소 모두) 멈춰 둔 캐릭터를 다시 움직인다
    menu.popup({
      window: win,
      callback: () => {
        if (!event.sender.isDestroyed())
          event.sender.send(IPC.characterCommand, { type: "resume" });
      },
    });
  });
}
