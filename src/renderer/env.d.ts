import type { ChiiApi } from "../shared/ipc";

declare global {
  interface Window {
    readonly chii: ChiiApi;
  }
}

export {};
