import type { ElysiaWebSocket } from "../interfaces/websocket.interface";
import type { StreamMessage } from "../interfaces/stream.interface";
import {
  startFFmpegProcess,
  cleanupStream,
  activeStreams,
} from "./stream.service";
import { LoggerService } from "../logger/logger.service";

const logger = LoggerService.getInstance("StreamController");

export const streamController = {
  open(ws: ElysiaWebSocket) {
    logger.info("Client connected");
  },

  message(ws: ElysiaWebSocket, message: unknown) {
    try {
      const parsedMessage =
        typeof message === "string" ? JSON.parse(message) : message;

      if (typeof parsedMessage !== "object" || parsedMessage === null) {
        ws.send(
          JSON.stringify({ type: "error", error: "Invalid message format" }),
        );
        return;
      }

      const { type, streamId, chunk, streamKind } =
        parsedMessage as StreamMessage;

      if (!streamId) {
        ws.send(JSON.stringify({ type: "error", error: "streamId required" }));
        return;
      }

      if (type === "start-stream") {
        if (activeStreams.has(streamId)) {
          ws.send(
            JSON.stringify({
              type: "error",
              streamId,
              error: "Stream already active",
            }),
          );
          return;
        }
        startFFmpegProcess(streamId, ws, streamKind);
        ws.send(JSON.stringify({ type: "stream-started", streamId }));
      }

      if (type === "video-chunk") {
        if (!chunk) {
          ws.send(
            JSON.stringify({
              type: "error",
              streamId,
              error: "No chunk provided",
            }),
          );
          return;
        }

        const streamData = activeStreams.get(streamId);
        if (streamData) {
          let bufferChunk: Buffer;

          if (chunk instanceof Uint8Array) {
            bufferChunk = Buffer.from(chunk);
          } else if (ArrayBuffer.isView(chunk)) {
            bufferChunk = Buffer.from(new Uint8Array(chunk.buffer));
          } else if (Array.isArray(chunk)) {
            bufferChunk = Buffer.from(chunk);
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                streamId,
                error: "Invalid chunk format",
              }),
            );
            return;
          }

          streamData.stream.write(bufferChunk, "binary");
        } else {
          ws.send(
            JSON.stringify({
              type: "error",
              streamId,
              error: "No active stream found",
            }),
          );
        }
      }

      if (type === "stop-stream") {
        cleanupStream(streamId);
        ws.send(JSON.stringify({ type: "stream-stopped", streamId }));
      }
    } catch (err) {
      logger.error("Error processing message:", err);
      ws.send(
        JSON.stringify({ type: "error", error: "Invalid message format" }),
      );
    }
  },

  close(ws: ElysiaWebSocket) {
    for (const [streamId, streamData] of activeStreams) {
      if (streamData.ws === ws) {
        cleanupStream(streamId);
      }
    }
  },
};
