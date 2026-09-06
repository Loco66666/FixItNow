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
 * Quote workflow (PHASE 06): the AUDIT locks DIAGNOSING → QUOTE_PENDING →
 * QUOTE_ACCEPTED → IN_PROGRESS (legal pricing disclosure before any work at
 * home, Service-Public F38350). Until quotes exist, DIAGNOSING → COMPLETED is
 * allowed as a temporary direct path — remove it when PHASE 06 lands.
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
    // TODO(PHASE 06): replace the direct COMPLETED edge with the quote workflow
    // (DIAGNOSING → QUOTE_PENDING → QUOTE_ACCEPTED → IN_PROGRESS).
    provider: [InterventionStatus.COMPLETED],
  },
  [InterventionStatus.QUOTE_PENDING]: {
    customer: [InterventionStatus.QUOTE_ACCEPTED],
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
