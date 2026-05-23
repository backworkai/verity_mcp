import type { IncomingMessage, ServerResponse } from "node:http";
import { handleOAuthProtectedResourceMetadataRequest } from "../src/index.js";

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  handleOAuthProtectedResourceMetadataRequest(req, res);
}
