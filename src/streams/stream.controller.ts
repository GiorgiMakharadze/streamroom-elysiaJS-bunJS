import type { ElysiaWebSocket } from "../interfaces/websocket.interface";
import type { StreamMessage } from "../interfaces/stream.interface";
import { startFFmpegProcess, cleanupRoom, activeStreams } from "./stream.service";
import { rooms } from "../store/stream.store";
import { LoggerService } from "../logger/logger.service";
import { STREAM_MESSAGE_TYPE } from "../enums/stream.enum";

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
        ws.send(JSON.stringify({ type: "error", error: "Invalid message format" }));
        return;
      }

      const { type, streamId, chunk, streamKind } = parsedMessage as StreamMessage;

      if (!streamId) {
        ws.send(JSON.stringify({ type: "error", error: "streamId required" }));
        return;
      }

      switch (type) {
        case STREAM_MESSAGE_TYPE.START_STREAM: {
          const room = rooms.get(streamId);
          if (room && room.publisher) {
            ws.send(JSON.stringify({
              type: "error",
              streamId,
              error: "Stream already active",
            }));
            return;
          }
          startFFmpegProcess(streamId, ws, streamKind);
          ws.send(JSON.stringify({ type: STREAM_MESSAGE_TYPE.STREAM_STARTED, streamId }));
          break;
        }
        case STREAM_MESSAGE_TYPE.JOIN_STREAM: {
          const room = rooms.get(streamId);
          if (!room || !room.publisher) {
            ws.send(JSON.stringify({
              type: "error",
              streamId,
              error: "Stream not active",
            }));
            return;
          }
          room.viewers.add(ws);
          ws.send(JSON.stringify({ type: STREAM_MESSAGE_TYPE.JOINED_STREAM, streamId }));
          break;
        }
        case STREAM_MESSAGE_TYPE.VIDEO_CHUNK: {
          const room = rooms.get(streamId);
          if (!room || !room.publisher) {
            ws.send(JSON.stringify({
              type: "error",
              streamId,
              error: "Stream not active",
            }));
            return;
          }
          if (room.publisher.ws !== ws) {
            ws.send(JSON.stringify({
              type: "error",
              streamId,
              error: "Not authorized to send video-chunks",
            }));
            return;
          }
          if (!chunk) {
            ws.send(JSON.stringify({
              type: "error",
              streamId,
              error: "No chunk provided",
            }));
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
              ws.send(JSON.stringify({
                type: "error",
                streamId,
                error: "Invalid chunk format",
              }));
              return;
            }
            streamData.stream.write(bufferChunk, "binary");
          } else {
            ws.send(JSON.stringify({
              type: "error",
              streamId,
              error: "No active stream found",
            }));
          }
          break;
        }
        case STREAM_MESSAGE_TYPE.STOP_STREAM: {
          const room = rooms.get(streamId);
          if (!room || !room.publisher || room.publisher.ws !== ws) {

            ws.send(JSON.stringify({
              type: "error",
              streamId,
              error: "Not authorized to stop stream",
            }));
            return;
          }
          cleanupRoom(streamId);
          ws.send(JSON.stringify({ type: "stream-stopped", streamId }));
          break;
        }
        default:
          ws.send(JSON.stringify({
            type: "error",
            streamId,
            error: "Unknown message type",
          }));
      }
    } catch (err) {
      logger.error("Error processing message:", err);
      ws.send(JSON.stringify({ type: "error", error: "Invalid message format" }));
    }
  },

  close(ws: ElysiaWebSocket) {
    for (const [streamId, room] of rooms.entries()) {
      if (room.publisher && room.publisher.ws === ws) {
        cleanupRoom(streamId);
      }
      if (room.viewers.has(ws)) {
        room.viewers.delete(ws);
      }
    }
    logger.info("Client disconnected");
  },
};
