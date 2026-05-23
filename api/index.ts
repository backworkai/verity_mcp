import type { IncomingMessage, ServerResponse } from "node:http";
import { handleRootRequest } from "../src/index.js";

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  handleRootRequest(req, res);
}
