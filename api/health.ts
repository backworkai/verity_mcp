import type { IncomingMessage, ServerResponse } from "node:http";
import { handleHealthRequest } from "../src/index.js";

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  handleHealthRequest(req, res);
}
