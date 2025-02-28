import { PassThrough } from "stream";
import { STREAM_MESSAGE_TYPE } from "../enums/stream.enum";
import { spawn } from "child_process";

interface ElysiaWebSocket {
  send(data: string): void;
}

interface StreamMessage {
  type: string;
  streamId: string;
  chunk?: Uint8Array | ArrayBuffer | number[];
  streamKind?: string;
}

interface ActiveStream {
  process: ReturnType<typeof spawn>;
  stream: PassThrough;
  ws: ElysiaWebSocket;
  retryCount: number;
}

export { ElysiaWebSocket, StreamMessage, ActiveStream };
