import { spawn } from "child_process";
import { PassThrough } from "stream";
import type { ActiveStream } from "../interfaces/stream.interface";
import type { ElysiaWebSocket } from "../interfaces/websocket.interface";
import { LoggerService } from "../logger/logger.service";
import { rooms } from "../store/stream.store";
import { STREAM_MESSAGE_TYPE } from "../enums/stream.enum";

const logger = LoggerService.getInstance("StreamService");
const MAX_FFMPEG_RETRIES = 5;

export const activeStreams = new Map<string, ActiveStream>();

export function startFFmpegProcess(
  streamId: string,
  ws: ElysiaWebSocket,
  streamKind?: string,
  retryCount = 0,
) {
  const videoStream = new PassThrough();
  const rtmpUrl = `${process.env.RTMP_SERVER}/live/${streamId}`;
  const ffmpegArgs = [
      "-f", "webm",
      "-i", "pipe:0",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-c:a", "aac",
      "-ar", "44100",
      "-f", "flv",
      rtmpUrl
  ];
  
  const ffmpegProcess = spawn("ffmpeg", ffmpegArgs);
  videoStream.pipe(ffmpegProcess.stdin);

  logger.info(`Started FFmpeg for stream ${streamId}, args: ${ffmpegArgs.join(" ")}`);


  ffmpegProcess.stderr.on("data", (data) => {
    const message = data.toString();

    if (message.includes("ffmpeg version")) {
      logger.info(`FFmpeg started for stream ${streamId}`);
      return
  }
    const room = rooms.get(streamId);
    if (room) {
      room.publisher?.ws.send(JSON.stringify({
        type: STREAM_MESSAGE_TYPE.STREAM_ERROR,
        streamId,
        error: message,
      }));
      room.viewers.forEach((viewer) =>
        viewer.send(JSON.stringify({
          type: STREAM_MESSAGE_TYPE.STREAM_ERROR,
          streamId,
          error: message,
        }))
      );
    }
  });

  ffmpegProcess.on("exit", (code) => {
    if (code !== 0 && retryCount < MAX_FFMPEG_RETRIES) {
      logger.warn(`FFmpeg exited for ${streamId} with code ${code}. Retrying (${retryCount + 1}/${MAX_FFMPEG_RETRIES})`);
      activeStreams.delete(streamId);
      const room = rooms.get(streamId);
      if (room) room.publisher = undefined;
      startFFmpegProcess(streamId, ws, streamKind, retryCount + 1);
    } else {
      logger.info(`Stream ${streamId} ended (exit code ${code}). Cleaning up.`);
      cleanupRoom(streamId);
      ws.send(JSON.stringify({ type: STREAM_MESSAGE_TYPE.STREAM_CLOSED, streamId }));
    }
  });

  let room = rooms.get(streamId);
  if (!room) {
    room = { viewers: new Set() };
    rooms.set(streamId, room);
  }
  room.publisher = {
    process: ffmpegProcess,
    stream: videoStream,
    ws,
    retryCount,
  };

  activeStreams.set(streamId, {
    process: ffmpegProcess,
    stream: videoStream,
    ws,
    retryCount,
  });
}

export function cleanupStream(streamId: string) {
  const streamData = activeStreams.get(streamId);
  if (streamData) {
    streamData.stream.end(() => {
      streamData.process.kill("SIGINT");
      activeStreams.delete(streamId);
    });
  }
}

export function cleanupRoom(streamId: string) {
  const room = rooms.get(streamId);
  if (room && room.publisher) {
    room.publisher.stream.end(() => {
      try {
        room.publisher?.process.kill("SIGINT");
      } catch (err) {
        logger.error(`Error killing FFmpeg for stream ${streamId}: ${err}`);
      }
    });
  }
  room?.viewers.forEach((viewer) =>
    viewer.send(JSON.stringify({ type: STREAM_MESSAGE_TYPE.STREAM_CLOSED, streamId }))
  );
  rooms.delete(streamId);
}

export function cleanupAllStreams() {
  for (const streamId of activeStreams.keys()) {
    cleanupStream(streamId);
  }
}
