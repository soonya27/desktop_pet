export type ReminderKind = "eyeRest" | "stretch" | "water";

export const REMINDER_KINDS: readonly ReminderKind[] = ["eyeRest", "stretch", "water"];

export interface ReminderSetting {
  enabled: boolean;
  intervalMin: number;
}

export interface Settings {
  reminders: Record<ReminderKind, ReminderSetting>;
  nativeNotification: boolean;
  launchAtLogin: boolean;
  /** 배고픔 수치 기능. 끄면 수치·표정·힌트가 모두 멈추고 밥주기는 모션만 */
  hungerEnabled: boolean;
}

export const REMINDER_LABEL: Record<ReminderKind, string> = {
  eyeRest: "눈 휴식",
  stretch: "스트레칭",
  water: "물 마시기",
};

export const REMINDER_MESSAGE: Record<ReminderKind, string> = {
  eyeRest: "눈이 뻑뻑하지 않아? 20초만 먼 곳을 바라봐 👀",
  stretch: "잠깐 일어나서 기지개 한 번! 🙆",
  water: "물 한 잔 마실 시간이야 💧",
};

export const INTERVAL_OPTIONS: Record<ReminderKind, readonly number[]> = {
  eyeRest: [15, 20, 30],
  stretch: [30, 50, 60],
  water: [30, 60, 90],
};

export type AnimState =
  "idle" | "walk" | "rest" | "talk" | "held" | "fall" | "land" | "react" | "pet" | "eat" | "sit";

/** 탭 반응 종류 (react 상태의 변형) */
export type ReactVariant = "happy" | "surprised" | "dizzy";
/** 배고픔에 따른 표정. 상태와 별개로 겹쳐 적용된다 */
export type Mood = "normal" | "hungry";

export const REACT_VARIANTS: readonly ReactVariant[] = ["happy", "surprised", "dizzy"];
