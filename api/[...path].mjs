import { handleApiRequest } from "../server/api.mjs";

export default async function handler(request, response) {
  const handled = await handleApiRequest(request, response);

  if (!handled && !response.headersSent) {
    response.statusCode = 404;
    response.end("Not found");
  }
}
