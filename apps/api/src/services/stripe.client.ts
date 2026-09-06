import Stripe from "stripe";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

/**
 * Thin, injectable gateway over the Stripe SDK (PHASE 07). The service layer
 * depends on this interface, never on the SDK directly, so integration tests
 * inject a fake via `setStripeGatewayForTests` and the rest of the app stays
 * Stripe-agnostic.
 */

export interface CreatedIntent {
  id: string;
  clientSecret?: string;
  status: string;
}

export interface CapturedIntent {
  id: string;
  status: string;
  amountCapturedCents: number;
}

export interface CanceledIntent {
  id: string;
  status: string;
}

export interface ProviderEvent {
  id: string;
  type: string;
  /** payment_intent id carried by the event, when applicable. */
  paymentIntentId?: string;
}

export interface StripeGateway {
  /** Create a PaymentIntent authorized but NOT captured (manual capture). */
  createManualCaptureIntent(input: {
    amountCents: number;
    currency: string;
    /** Platform commission in cents, passed for Stripe reporting. */
    applicationFeeCents: number;
    metadata: Record<string, string>;
    /** Auto-expires the authorization after Stripe's max hold window. */
    expiresAt?: Date;
  }): Promise<CreatedIntent>;

  captureIntent(intentId: string): Promise<CapturedIntent>;

  cancelIntent(intentId: string): Promise<CanceledIntent>;

  /**
   * Verify the webhook signature and parse the event. Throws when the
   * signature does not match (400 territory for the caller).
   */
  constructWebhookEvent(rawBody: Buffer, signature: string): ProviderEvent;
}

class RealStripeGateway implements StripeGateway {
  constructor(private readonly client: Stripe) {}

  async createManualCaptureIntent(input: {
    amountCents: number;
    currency: string;
    applicationFeeCents: number;
    metadata: Record<string, string>;
    expiresAt?: Date;
  }): Promise<CreatedIntent> {
    const intent = await this.client.paymentIntents.create({
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      capture_method: "manual",
      metadata: input.metadata,
    });
    return {
      id: intent.id,
      clientSecret: intent.client_secret ?? undefined,
      status: intent.status,
    };
  }

  async captureIntent(intentId: string): Promise<CapturedIntent> {
    const intent = await this.client.paymentIntents.capture(intentId);
    return {
      id: intent.id,
      status: intent.status,
      amountCapturedCents: intent.amount_received,
    };
  }

  async cancelIntent(intentId: string): Promise<CanceledIntent> {
    const intent = await this.client.paymentIntents.cancel(intentId);
    return { id: intent.id, status: intent.status };
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): ProviderEvent {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw AppError.internal("STRIPE_WEBHOOK_SECRET is not configured");
    }
    const event = this.client.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
    const pi = event.data.object as { id?: string };
    return {
      id: event.id,
      type: event.type,
      paymentIntentId: pi.id,
    };
  }
}

let gateway: StripeGateway | null = null;

/** Lazily build (or return) the real gateway; throws 503 when unconfigured. */
export function getStripeGateway(): StripeGateway {
  if (gateway) return gateway;
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError({
      status: 503,
      code: "PAYMENTS_NOT_CONFIGURED",
      message: "Payments are not configured (missing STRIPE_SECRET_KEY)",
    });
  }
  gateway = new RealStripeGateway(new Stripe(env.STRIPE_SECRET_KEY));
  return gateway;
}

/** Test seam: inject a fake gateway (or null to reset). */
export function setStripeGatewayForTests(gw: StripeGateway | null): void {
  gateway = gw;
}
