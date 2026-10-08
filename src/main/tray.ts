import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from "electron";
import { join } from "node:path";
import { REMINDER_KINDS, REMINDER_LABEL } from "../shared/types";
import { feedItem, pauseSubmenu, settingsItems } from "./menus";
import type { Overlays } from "./overlays";
import type { PetState } from "./petState";
import type { ReminderEngine } from "./reminders";

export interface TrayController {
  rebuild(): void;
}

export function createTray(
  engine: ReminderEngine,
  overlays: Overlays,
  pet: PetState,
): TrayController {
  const icon = nativeImage.createFromPath(join(app.getAppPath(), "resources", "trayTemplate.png"));
  icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip("withChii");

  const rebuild = (): void => tray.setContextMenu(buildMenu(engine, overlays, pet, rebuild));
  rebuild();
  return { rebuild };
}

function buildMenu(
  engine: ReminderEngine,
  overlays: Overlays,
  pet: PetState,
  rebuild: () => void,
): Menu {
  return Menu.buildFromTemplate([
    {
      label: "캐릭터 보이기",
      type: "checkbox",
      checked: !overlays.isCharacterHidden(),
      click: (item) => {
        overlays.setCharacterHidden(!item.checked);
        rebuild();
      },
    },
    feedItem(pet),
    pauseSubmenu(engine, rebuild),
    { type: "separator" },
    ...settingsItems(pet, rebuild),
    { type: "separator" },
    {
      label: "테스트 알림 보내기",
      submenu: REMINDER_KINDS.map<MenuItemConstructorOptions>((kind) => ({
        label: REMINDER_LABEL[kind],
        click: () => engine.trigger(kind),
      })),
    },
    { type: "separator" },
    { label: "withChii 종료", role: "quit" },
  ]);
}
