// Coalesce matching requests inside one server instance. Mindbody's own request
// deduplication remains enabled for concurrent requests on separate instances.
export function createBookingSingleFlight() {
  const pending = new Map();
  return function singleFlight(key, operation) {
    if (pending.has(key)) return pending.get(key);
    const promise = Promise.resolve().then(operation).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  };
}
