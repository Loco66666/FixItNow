import type { InterventionEvent } from "@fixitnow/types";
import { getRedis } from "../config/redis";
import { logger } from "../config/logger";

export const interventionChannel = (interventionId: string) =>
  `intervention:${interventionId}`;

export type InterventionEventHandler = (event: InterventionEvent) => void;

/**
 * Best-effort publish of a domain event onto the intervention Redis channel
 * (`intervention:{id}`). Delivery is fire-and-forget: Mongo remains the source
 * of truth and SSE is a projection, so a Redis hiccup must never fail the
 * underlying state change.
 */
export async function publishInterventionEvent(
  event: InterventionEvent
): Promise<void> {
  try {
    await getRedis().publish(
      interventionChannel(event.interventionId),
      JSON.stringify(event)
    );
  } catch (err) {
    logger.warn(
      { err: { message: (err as Error).message }, type: event.type },
      "intervention event publish failed"
    );
  }
}

/**
 * Subscribe to all events of one intervention. Returns an async cleanup that
 * unsubscribes the channel and disconnects the dedicated subscriber client
 * (ioredis pattern: publishing and subscribing on the same connection is not
 * allowed, so we `duplicate()`).
 */
export async function subscribeInterventionEvent(
  interventionId: string,
  handler: InterventionEventHandler
): Promise<() => Promise<void>> {
  const channel = interventionChannel(interventionId);
  const subscriber = getRedis().duplicate();
  let closed = false;

  subscriber.on("message", (receivedChannel, message) => {
    if (receivedChannel !== channel) return;
    try {
      handler(JSON.parse(message) as InterventionEvent);
    } catch (err) {
      logger.warn(
        { err: { message: (err as Error).message } },
        "invalid intervention event discarded"
      );
    }
  });

  await subscriber.subscribe(channel);

  return async () => {
    if (closed) return;
    closed = true;
    try {
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    } catch {
      subscriber.disconnect();
    }
  };
}
