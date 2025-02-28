import { app } from "./app";
import { LoggerService } from "./logger/logger.service";
import { cleanupAllStreams } from "./streams/stream.service";

const PORT = process.env.PORT || 5000;
const logger = LoggerService.getInstance("StreamController");

app.listen(PORT, () => {
  logger.info(`Bun.js Elysia WebSocket server running on port ${PORT}`);
});

process.on("SIGTERM", cleanupAllStreams);
process.on("SIGINT", cleanupAllStreams);
