import { Types } from "mongoose";
import {
  InterventionStatus,
  ProviderRealtimeStatus as RealtimeStatusEnum,
  type InterventionAction,
  type InterventionEvent,
} from "@fixitnow/types";

import { logger } from "../config/logger";
import { Intervention } from "../models/automotive/Intervention";
import { InterventionStatusHistory } from "../models/automotive/InterventionStatusHistory";
import { Professional } from "../models/automotive/Professional";
import { AppError } from "../utils/AppError";
import { assertTransition } from "./intervention-state";
import { publishInterventionEvent } from "./intervention-events";
import { setProviderRealtimeStatusForUser } from "./provider-realtime.service";

/** Target status each lifecycle action moves the intervention to. */
const ACTION_TARGET: Record<InterventionAction, InterventionStatus> = {
  "en-route": InterventionStatus.EN_ROUTE,
  arrive: InterventionStatus.ARRIVED,
  diagnose: InterventionStatus.DIAGNOSING,
  complete: InterventionStatus.COMPLETED,
};

export interface RunProviderActionInput {
  interventionId: string;
  professionalUserId: string;
  action: InterventionAction;
  note?: string;
}

/**
 * Run a lifecycle action (en-route / arrive / diagnose / complete) on behalf
 * of the ASSIGNED provider.
 *
 * Guarantees
 *  - Only the assigned professional may act (403 otherwise).
 *  - The transition must be legal per the state table (409 otherwise).
 *  - The status flip is a single compare-&-swap (`status: current` in the
 *    filter), so two racing actions cannot double-apply: the loser gets 409.
 *  - History, SSE and the provider's real-time status are best-effort — the
 *    state flip remains the source of truth.
 */
export async function runProviderAction(input: RunProviderActionInput) {
  const interventionOid = toObjectId(input.interventionId);
  const now = new Date();
  const target = ACTION_TARGET[input.action];

  const professional = await Professional.findOne({
    user: new Types.ObjectId(input.professionalUserId),
    isActive: true,
  })
    .select("_id")
    .lean();
  if (!professional) {
    throw AppError.forbidden(
      "You are not registered as an active professional"
    );
  }
  const proId = professional._id;

  const intervention = await Intervention.findOne({
    _id: interventionOid,
  })
    .select("status professional")
    .lean();
  if (!intervention) {
    throw AppError.notFound("Intervention");
  }
  if (
    !intervention.professional ||
    String(intervention.professional) !== String(proId)
  ) {
    throw AppError.forbidden(
      "Only the assigned provider can run lifecycle actions"
    );
  }

  const previousStatus = intervention.status as InterventionStatus;
  assertTransition(previousStatus, target, "provider");

  // Atomic compare-&-swap: pin the current status so a concurrent action
  // (or a customer cancellation racing us) cannot double-apply.
  const updated = await Intervention.findOneAndUpdate(
    { _id: interventionOid, status: previousStatus, professional: proId },
    {
      $set: {
        status: target,
        ...(target === InterventionStatus.COMPLETED
          ? { completedAt: now }
          : {}),
      },
    },
    { new: true }
  )
    .select("status completedAt")
    .lean();

  if (!updated) {
    // The status moved underneath us (e.g. customer cancelled mid-flight).
    throw AppError.conflict(
      `Intervention is no longer in status ${previousStatus}`
    );
  }

  // Audit trail (best-effort).
  try {
    await InterventionStatusHistory.create({
      intervention: interventionOid,
      fromStatus: previousStatus,
      toStatus: target,
      actor: new Types.ObjectId(input.professionalUserId),
      reason: input.note ?? `Provider ran "${input.action}"`,
    });
  } catch {
    /* audit log is best-effort */
  }

  // Real-time fan-out (best-effort): stream the transition and, on completion,
  // release the provider back to OPEN.
  const event: InterventionEvent = {
    type: "intervention.status-changed",
    interventionId: interventionOid.toHexString(),
    data: {
      action: input.action,
      from: previousStatus,
      to: target,
      professionalId: proId.toHexString(),
      ...(input.note ? { note: input.note } : {}),
      at: now.toISOString(),
    },
    emittedAt: now.toISOString(),
  };
  await publishInterventionEvent(event);

  if (target === InterventionStatus.COMPLETED) {
    try {
      await setProviderRealtimeStatusForUser(
        input.professionalUserId,
        RealtimeStatusEnum.OPEN
      );
    } catch (err) {
      logger.warn(
        { err: { message: (err as Error)?.message } },
        "provider realtime status release failed"
      );
    }
  }

  return {
    interventionId: interventionOid.toHexString(),
    action: input.action,
    previousStatus,
    status: target,
    ...(target === InterventionStatus.COMPLETED
      ? { completedAt: now.toISOString() }
      : {}),
  };
}

function toObjectId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw AppError.badRequest("Invalid interventionId");
  }
  return new Types.ObjectId(value);
}
