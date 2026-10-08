import { Bubble } from "./bubble";
import { Character, EAT_MS } from "./character/character";
import { attachGestures } from "./character/gesture";
import { PlaceholderSkin } from "./character/skin";
import { SpriteSkin, type SkinManifest } from "./character/spriteSkin";
import chiiManifest from "./assets/skins/chii/skin.json";
import { setupClickThrough } from "./mouse";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`#${id} not found`);
  return el as T;
}

const characterEl = byId<HTMLDivElement>("character");
const bubbleEl = byId<HTMLDivElement>("bubble");

// 이미지 스킨. 코드 그림으로 돌아가려면 USE_SPRITE를 false로
const USE_SPRITE = true;
const skinImages = import.meta.glob("./assets/skins/chii/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const imageUrls = Object.fromEntries(
  Object.entries(skinImages).map(([path, url]) => [path.split("/").pop() ?? path, url]),
);
const skin = USE_SPRITE
  ? new SpriteSkin(chiiManifest as SkinManifest, imageUrls)
  : new PlaceholderSkin();
const character = new Character(characterEl, skin);
const bubble = new Bubble(
  bubbleEl,
  byId<HTMLParagraphElement>("bubbleText"),
  byId<HTMLDivElement>("bubbleActions"),
  byId<HTMLButtonElement>("bubbleOk"),
  byId<HTMLButtonElement>("bubbleSnooze"),
);

character.start();
const clickThrough = setupClickThrough([characterEl, bubbleEl]);

// 이 창에서 시작한 드래그. 커서가 다른 모니터로 넘어가면 메인이 캐릭터를 그 창으로 옮기지만
// 포인터 이벤트는 계속 이 창에 오므로 좌표를 메인에 중계한다.
attachGestures(characterEl, {
  onPress: () => clickThrough.lock(),
  onRelease: () => clickThrough.unlock(),
  // 탭: 말풍선이 떠 있으면 확인 처리하고 반응 모션
  onTap: () => {
    bubble.dismiss();
    character.react();
  },
  onHoldStart: () => character.startPet(),
  onHoldEnd: () => character.stopPet(),
  onDragStart: (p) => {
    bubble.dismiss();
    character.pickUp(p);
    window.chii.dragStart({ pointer: p, grabOffset: character.grabOffset() });
  },
  onDragMove: (p) => {
    bubble.dismiss();
    if (character.isActive()) character.moveTo(p);
    window.chii.dragMove({ pointer: p });
  },
  onDragEnd: () => {
    if (character.isActive()) character.drop();
    window.chii.dragEnd();
  },
});

// 메인이 결정하는 캐릭터 소유권 (멀티 모니터)
window.chii.onCharacterTakeover((payload) => character.takeOver(payload));
window.chii.onCharacterRelease(() => {
  bubble.dismiss();
  character.release();
});
window.chii.onCharacterDragMove(({ pointer }) => character.moveTo(pointer));
window.chii.onCharacterDrop(() => character.drop());

// 우클릭 → 메인이 네이티브 메뉴를 띄우고, 선택 결과를 명령으로 돌려준다
characterEl.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  character.setPaused(true);
  window.chii.openCharacterMenu({ sleeping: character.isSleeping() });
});
window.chii.onCharacterCommand((command) => {
  if (command.type === "toggleSleep") character.toggleSleep();
  if (command.type === "eat") feed();
  if (command.type === "resume") character.setPaused(false);
});

// 밥주기: 캐릭터 앞에 밥그릇을 놓고 먹는 동안 보여준다
const bowlEl = byId<HTMLDivElement>("bowl");
const BOWL_WIDTH = 40;
const BOWL_HEIGHT = 24;
let bowlTimer = 0;
function feed(): void {
  bubble.dismiss();
  if (!character.eat()) return;
  // 이미지 스킨의 eat 프레임에는 밥그릇이 그려져 있으므로 코드 그림 스킨일 때만 따로 놓는다
  if (!(skin instanceof PlaceholderSkin)) return;
  // 발 앞쪽(바라보는 방향)에, 캐릭터와 같은 각도로 놓는다 (벽·천장에서도 발치에 붙는다)
  const f = character.feet();
  const rad = (f.rot * Math.PI) / 180;
  const ahead = f.dir * 48;
  const bx = f.x + Math.cos(rad) * ahead;
  const by = f.y + Math.sin(rad) * ahead;
  bowlEl.style.transform = `translate3d(${bx - BOWL_WIDTH / 2}px, ${by - BOWL_HEIGHT}px, 0) rotate(${f.rot}deg)`;
  bowlEl.hidden = false;
  window.clearTimeout(bowlTimer);
  bowlTimer = window.setTimeout(() => {
    bowlEl.hidden = true;
  }, EAT_MS);
}

// 배고픔: 표정을 바꾸고, 배고픈 동안 가끔 "배고파…" 힌트
const HUNGRY_HINT_EVERY_MS = 10 * 60_000;
const HUNGRY_HINT_SHOW_MS = 4_000;
let hungry = false;
let lastHintAt = 0;
window.chii.onPetState((state) => {
  hungry = state.hungry;
  character.setMood(hungry ? "hungry" : "normal");
});
window.setInterval(() => {
  if (!hungry || !character.isActive()) return;
  if (Date.now() - lastHintAt < HUNGRY_HINT_EVERY_MS) return;
  lastHintAt = Date.now();
  bubble.showHint("배고파…", character.anchor(), HUNGRY_HINT_SHOW_MS);
}, 30_000);

window.chii.onReminderShow(({ kind, message }) => {
  character.setTalking(true);
  bubble.show(message, character.anchor(), (snoozeMin) => {
    character.setTalking(false);
    window.chii.ackReminder({ kind, snoozeMin });
  });
});
