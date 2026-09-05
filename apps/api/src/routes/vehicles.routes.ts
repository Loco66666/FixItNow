import { Router } from "express";
import {
  createVehicleSchema,
  updateVehicleSchema,
  vehicleIdParamSchema,
  vehicleListQuerySchema,
} from "@fixitnow/types";
import { requireAuth } from "../middlewares/requireAuth";
import { rateLimit } from "../middlewares/rateLimit";
import { validate } from "../middlewares/validate";
import {
  createVehicleController,
  deleteVehicleController,
  getVehicleController,
  listMyVehiclesController,
  updateVehicleController,
} from "../controllers/vehicles.controller";

const router = Router();

router.post(
  "/",
  requireAuth,
  rateLimit({ name: "vehicles.create", max: 30, windowSec: 60 }),
  validate({ body: createVehicleSchema }),
  createVehicleController
);

router.get(
  "/mine",
  requireAuth,
  validate({ query: vehicleListQuerySchema }),
  listMyVehiclesController
);

router.patch(
  "/:id",
  requireAuth,
  validate({ params: vehicleIdParamSchema, body: updateVehicleSchema }),
  updateVehicleController
);

router.delete(
  "/:id",
  requireAuth,
  validate({ params: vehicleIdParamSchema }),
  deleteVehicleController
);

router.get(
  "/:id",
  requireAuth,
  validate({ params: vehicleIdParamSchema }),
  getVehicleController
);

export default router;
