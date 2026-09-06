import { InterventionStatus } from "@fixitnow/types";
import { AppError } from "../utils/AppError";

export type InterventionActor = "customer" | "provider" | "system";

/**
 * Legal status transitions of an intervention, per AUDIT §6.
 *
 * Key = the CURRENT status; value = the statuses each actor may move it to.
 * Anything not listed here is illegal and must be rejected with 409 — the
 * service layer funnels every mutation through `assertTransition` so the graph
 * cannot drift per call site.
 *
 * Terminal states (COMPLETED, CANCELLED, DECLINED, EXPIRED, FAILED, NO_SHOW,
 * DISPUTED) intentionally have no outgoing edges.
 *
 * Quote workflow (PHASE 06): DIAGNOSING → QUOTE_PENDING → QUOTE_ACCEPTED →
 * IN_PROGRESS (legal pricing disclosure before any work at home, Service-Public
 * F38350). Until quotes become mandatory, DIAGNOSING → COMPLETED stays allowed
 * as a temporary direct path (TODO: PHASE 09 — lift the permit).
 */
export const INTERVENTION_TRANSITIONS: Record<
  InterventionStatus,
  Partial<Record<InterventionActor, readonly InterventionStatus[]>>
> = {
  [InterventionStatus.REQUESTED]: {
    customer: [InterventionStatus.CANCELLED],
    provider: [InterventionStatus.DECLINED],
    system: [InterventionStatus.SEARCHING, InterventionStatus.EXPIRED],
  },
  [InterventionStatus.SEARCHING]: {
    customer: [InterventionStatus.CANCELLED],
    provider: [InterventionStatus.DECLINED],
    system: [InterventionStatus.EXPIRED],
  },
  [InterventionStatus.OFFERED]: {
    customer: [InterventionStatus.CANCELLED],
    provider: [InterventionStatus.DECLINED],
  },
  [InterventionStatus.ACCEPTED]: {
    provider: [InterventionStatus.EN_ROUTE],
    customer: [InterventionStatus.CANCELLED],
  },
  [InterventionStatus.EN_ROUTE]: {
    provider: [InterventionStatus.ARRIVED],
  },
  [InterventionStatus.ARRIVED]: {
    provider: [InterventionStatus.DIAGNOSING],
  },
  [InterventionStatus.DIAGNOSING]: {
    // PHASE 06: the provider submits a quote → intervention becomes QUOTE_PENDING
    // (until the customer accepts → QUOTE_ACCEPTED → IN_PROGRESS).
    // The direct DIAGNOSING → COMPLETED path stays allowed until quotes are
    // mandatory (TODO: PHASE 09 — lift the permit).
    provider: [InterventionStatus.QUOTE_PENDING, InterventionStatus.COMPLETED],
  },
  [InterventionStatus.QUOTE_PENDING]: {
    // Customer decision: accept → QUOTE_ACCEPTED (pro can then move to
    // IN_PROGRESS), or reject → back to DIAGNOSING so the provider may submit
    // a revised devis (Service-Public F38350: pricing disclosure loop).
    customer: [
      InterventionStatus.QUOTE_ACCEPTED,
      InterventionStatus.DIAGNOSING,
    ],
  },
  [InterventionStatus.QUOTE_ACCEPTED]: {
    provider: [InterventionStatus.IN_PROGRESS],
  },
  [InterventionStatus.IN_PROGRESS]: {
    provider: [InterventionStatus.COMPLETED],
  },
  // Terminal states — no outgoing transitions.
  [InterventionStatus.COMPLETED]: {},
  [InterventionStatus.PAYMENT_PENDING]: {},
  [InterventionStatus.PAID]: {},
  [InterventionStatus.RATED]: {},
  [InterventionStatus.CANCELLED]: {},
  [InterventionStatus.DECLINED]: {},
  [InterventionStatus.EXPIRED]: {},
  [InterventionStatus.NO_SHOW]: {},
  [InterventionStatus.DISPUTED]: {},
  [InterventionStatus.FAILED]: {},
};

/** Whether `actor` may move an intervention from `from` to `to`. */
export function isTransitionAllowed(
  from: InterventionStatus,
  to: InterventionStatus,
  actor: InterventionActor
): boolean {
  return INTERVENTION_TRANSITIONS[from]?.[actor]?.includes(to) ?? false;
}

/** Throws 409 when the transition is outside the legal graph. */
export function assertTransition(
  from: InterventionStatus,
  to: InterventionStatus,
  actor: InterventionActor
): void {
  if (from === to) {
    throw AppError.conflict(`Intervention is already in status ${from}`);
  }
  if (!isTransitionAllowed(from, to, actor)) {
    throw AppError.conflict(
      `Illegal transition ${from} → ${to} for actor "${actor}"`
    );
  }
}
