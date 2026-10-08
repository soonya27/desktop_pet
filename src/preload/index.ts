import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type CharacterCommand,
  type CharacterTakeoverPayload,
  type ChiiApi,
  type DragMovePayload,
  type PetStatePayload,
  type ReminderShowPayload,
} from "../shared/ipc";

const api: ChiiApi = {
  setIgnoreMouse: (ignore) => ipcRenderer.send(IPC.setIgnoreMouse, ignore),
  onReminderShow: (listener) => {
    ipcRenderer.on(IPC.reminderShow, (_event, payload: ReminderShowPayload) => listener(payload));
  },
  ackReminder: (payload) => ipcRenderer.send(IPC.reminderAck, payload),
  dragStart: (payload) => ipcRenderer.send(IPC.dragStart, payload),
  dragMove: (payload) => ipcRenderer.send(IPC.dragMove, payload),
  dragEnd: () => ipcRenderer.send(IPC.dragEnd),
  onCharacterTakeover: (listener) => {
    ipcRenderer.on(IPC.characterTakeover, (_event, payload: CharacterTakeoverPayload) =>
      listener(payload),
    );
  },
  onCharacterRelease: (listener) => {
    ipcRenderer.on(IPC.characterRelease, () => listener());
  },
  onCharacterDragMove: (listener) => {
    ipcRenderer.on(IPC.characterDragMove, (_event, payload: DragMovePayload) => listener(payload));
  },
  onCharacterDrop: (listener) => {
    ipcRenderer.on(IPC.characterDrop, () => listener());
  },
  openCharacterMenu: (request) => ipcRenderer.send(IPC.characterContextMenu, request),
  onCharacterCommand: (listener) => {
    ipcRenderer.on(IPC.characterCommand, (_event, command: CharacterCommand) => listener(command));
  },
  onPetState: (listener) => {
    ipcRenderer.on(IPC.petState, (_event, state: PetStatePayload) => listener(state));
  },
};

contextBridge.exposeInMainWorld("chii", api);
