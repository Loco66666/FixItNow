import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { rateLimit } from "../middlewares/rateLimit";
import { validate } from "../middlewares/validate";
import { paymentIdParamSchema } from "@fixitnow/types";
import { cancelPaymentController } from "../controllers/payments.controller";

const router = Router();

/**
 * POST /payments/:paymentId/cancel
 *
 * Customer cancels a live (PENDING) authorization before capture.
 */
router.post(
  "/:paymentId/cancel",
  requireAuth,
  rateLimit({ name: "payments.cancel", max: 10, windowSec: 60 }),
  validate({ params: paymentIdParamSchema }),
  cancelPaymentController
);

export default router;
