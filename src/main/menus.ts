import { app, type MenuItemConstructorOptions } from "electron";
import {
  INTERVAL_OPTIONS,
  REMINDER_KINDS,
  REMINDER_LABEL,
  type ReminderKind,
} from "../shared/types";
import type { PetState } from "./petState";
import type { ReminderEngine } from "./reminders";
import { getSettings, updateSettings } from "./settings";

/** 트레이 메뉴와 캐릭터 컨텍스트 메뉴가 공유하는 항목들. onChange는 메뉴를 다시 그릴 때 호출 */

export function pauseSubmenu(
  engine: ReminderEngine,
  onChange: () => void,
): MenuItemConstructorOptions {
  const paused = engine.isPaused();
  const pauseItem = (label: string, minutes: number): MenuItemConstructorOptions => ({
    label,
    click: () => {
      engine.pause(minutes);
      onChange();
    },
  });
  return {
    label: paused ? "알림 일시정지 중" : "알림 일시정지",
    submenu: [
      pauseItem("30분", 30),
      pauseItem("1시간", 60),
      { type: "separator" },
      {
        label: "다시 켜기",
        enabled: paused,
        click: () => {
          engine.pause(null);
          onChange();
        },
      },
    ],
  };
}

function reminderSubmenu(kind: ReminderKind, onChange: () => void): MenuItemConstructorOptions {
  const setting = getSettings().reminders[kind];
  return {
    label: `${REMINDER_LABEL[kind]}  (${setting.enabled ? `${setting.intervalMin}분마다` : "꺼짐"})`,
    submenu: [
      {
        label: "켜기",
        type: "checkbox",
        checked: setting.enabled,
        click: (item) => {
          updateSettings((s) => {
            s.reminders[kind].enabled = item.checked;
          });
          onChange();
        },
      },
      { type: "separator" },
      ...INTERVAL_OPTIONS[kind].map<MenuItemConstructorOptions>((min) => ({
        label: `${min}분마다`,
        type: "radio",
        checked: setting.intervalMin === min,
        click: () => {
          updateSettings((s) => {
            s.reminders[kind].intervalMin = min;
          });
          onChange();
        },
      })),
    ],
  };
}

export function feedItem(pet: PetState): MenuItemConstructorOptions {
  const hunger = pet.hunger();
  const enabled = getSettings().hungerEnabled;
  return {
    label: enabled ? `밥주기  (배고픔 ${hunger})` : "밥주기",
    click: () => pet.feed(),
  };
}

export function settingsItems(pet: PetState, onChange: () => void): MenuItemConstructorOptions[] {
  const settings = getSettings();
  return [
    {
      label: "배고픔 기능",
      type: "checkbox",
      checked: settings.hungerEnabled,
      click: (item) => {
        updateSettings((s) => {
          s.hungerEnabled = item.checked;
        });
        pet.refresh();
        onChange();
      },
    },
    { type: "separator" },
    ...REMINDER_KINDS.map((kind) => reminderSubmenu(kind, onChange)),
    { type: "separator" },
    {
      label: "macOS 알림도 표시",
      type: "checkbox",
      checked: settings.nativeNotification,
      click: (item) => {
        updateSettings((s) => {
          s.nativeNotification = item.checked;
        });
        onChange();
      },
    },
    {
      label: app.isPackaged ? "로그인 시 자동 실행" : "로그인 시 자동 실행 (패키징 앱에서만)",
      enabled: app.isPackaged,
      type: "checkbox",
      checked: settings.launchAtLogin,
      click: (item) => {
        updateSettings((s) => {
          s.launchAtLogin = item.checked;
        });
        app.setLoginItemSettings({ openAtLogin: item.checked });
        onChange();
      },
    },
  ];
}
