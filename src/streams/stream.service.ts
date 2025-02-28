import { spawn } from "child_process";
import { PassThrough } from "stream";
import type { ActiveStream } from "../interfaces/stream.interface";
import type { ElysiaWebSocket } from "../interfaces/websocket.interface";
import { LoggerService } from "../logger/logger.service";

const logger = LoggerService.getInstance("StreamController");

const MAX_FFMPEG_RETRIES = 5;
export const activeStreams = new Map<string, ActiveStream>();

export function startFFmpegProcess(
  streamId: string,
  ws: ElysiaWebSocket,
  streamKind?: string,
  retryCount = 0,
) {
  const videoStream = new PassThrough();
  const rtmpUrl = `${process.env.RTMP_SERVER || "rtmp://localhost"}/live/${streamId}`;

  const ffmpegArgs = ["-i", "pipe:0"];
  if (streamKind) {
    ffmpegArgs.unshift("-f", streamKind);
  }
  ffmpegArgs.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-ar",
    "44100",
    "-f",
    "flv",
    rtmpUrl,
  );

  const ffmpegProcess = spawn("ffmpeg", ffmpegArgs);

  videoStream.pipe(ffmpegProcess.stdin);

  ffmpegProcess.stderr.on("data", (data) => {
    logger.error(`FFmpeg error (stream ${streamId}):`, data.toString());
    ws.send(
      JSON.stringify({
        type: "stream-error",
        streamId,
        error: data.toString(),
      }),
    );
  });

  ffmpegProcess.on("exit", (code) => {
    if (code !== 0 && retryCount < MAX_FFMPEG_RETRIES) {
      logger.warn(
        `FFmpeg exited for ${streamId}, retrying (${retryCount + 1}/${MAX_FFMPEG_RETRIES})`,
      );
      activeStreams.delete(streamId);
      startFFmpegProcess(streamId, ws, streamKind, retryCount + 1);
    } else {
      logger.info(`Stream ${streamId} ended (code ${code})`);
      cleanupStream(streamId);
      ws.send(JSON.stringify({ type: "stream-closed", streamId }));
    }
  });

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

export function cleanupAllStreams() {
  for (const streamId of activeStreams.keys()) {
    cleanupStream(streamId);
  }
}
