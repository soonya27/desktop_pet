import { app, BrowserWindow } from "electron";
import { join } from "node:path";

/** 디스플레이 하나의 작업 영역을 덮는 투명 오버레이 창 */
export function createOverlayWindow(bounds: Electron.Rectangle): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    show: false,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // macOS 비활성 패널: 클릭을 받아도 앞 앱의 포커스를 뺏지 않는다
    type: "panel",
    acceptFirstMouse: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });

  win.once("ready-to-show", () => {
    win.showInactive();
    // 패널 창은 show 시점에 macOS가 주 화면 쪽으로 위치를 밀어 놓으므로 다시 잡아 준다
    win.setBounds(bounds);
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}
