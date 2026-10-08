import { app } from "electron";
import { IPC } from "../shared/ipc";
import { registerContextMenu } from "./contextMenu";
import { createDragCoordinator } from "./drag";
import { registerIpc } from "./ipc";
import { createOverlays } from "./overlays";
import { createPetState } from "./petState";
import { createReminderEngine } from "./reminders";
import { getSettings, loadSettings } from "./settings";
import { createTray } from "./tray";

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void app.whenReady().then(() => {
    app.dock?.hide();
    loadSettings();
    // 설정 파일이 기준. 패키징된 앱만 로그인 항목에 등록한다
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: getSettings().launchAtLogin });

    const overlays = createOverlays();
    const engine = createReminderEngine((payload) =>
      overlays.sendToOwner(IPC.reminderShow, payload),
    );
    registerIpc(engine, createDragCoordinator(overlays));
    const pet = createPetState(overlays);
    const tray = createTray(engine, overlays, pet);
    registerContextMenu(overlays, engine, tray, pet);
  });

  // 메뉴바 앱이므로 창이 닫혀도 종료하지 않는다
  app.on("window-all-closed", () => {});
}
