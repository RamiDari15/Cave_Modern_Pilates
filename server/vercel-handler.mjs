import { handleApiRequest } from "./api.mjs";

export default async function vercelApiHandler(request, response) {
  const handled = await handleApiRequest(request, response);

  if (!handled && !response.headersSent) {
    response.statusCode = 404;
    response.end("Not found");
  }
}
