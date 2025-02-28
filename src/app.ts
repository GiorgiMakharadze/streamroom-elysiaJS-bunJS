import { Elysia } from "elysia";
import { streamController } from "./streams/stream.controller";

export const app = new Elysia();

app.get("/", () => "Server is running");
app.ws("/stream", streamController);
