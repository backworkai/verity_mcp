import type { IncomingMessage, ServerResponse } from "node:http";
import { handleMcpEndpointRequest } from "../src/index.js";

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await handleMcpEndpointRequest(req, res);
}
