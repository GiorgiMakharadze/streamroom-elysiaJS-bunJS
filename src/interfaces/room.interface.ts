import type { ActiveStream } from "./stream.interface";
import type { ElysiaWebSocket } from "./websocket.interface";

export interface Room {
  publisher?: ActiveStream;
  viewers: Set<ElysiaWebSocket>;
}
