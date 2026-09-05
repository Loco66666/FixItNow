import type { NextFunction, Request, Response } from "express";
import {
  createVehicle,
  deleteOwnerVehicle,
  getOwnerVehicle,
  listOwnerVehicles,
  updateOwnerVehicle,
} from "../services/vehicle.service";

export async function createVehicleController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");

    const vehicle = await createVehicle({
      ...req.body,
      ownerId: req.auth.userId,
    });

    res.status(201).json({ data: vehicle });
  } catch (error) {
    next(error);
  }
}

export async function listMyVehiclesController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");

    const result = await listOwnerVehicles(req.auth.userId, {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
    });

    res.json({
      data: result.items,
      pagination: {
        total: result.total,
        limit: result.limit,
        skip: result.skip,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getVehicleController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");

    const vehicle = await getOwnerVehicle(req.params.id, req.auth.userId);

    res.json({ data: vehicle });
  } catch (error) {
    next(error);
  }
}

export async function updateVehicleController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");

    const vehicle = await updateOwnerVehicle(
      req.params.id,
      req.auth.userId,
      req.body
    );

    res.json({ data: vehicle });
  } catch (error) {
    next(error);
  }
}

export async function deleteVehicleController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.auth) throw new Error("Missing auth context");

    const result = await deleteOwnerVehicle(req.params.id, req.auth.userId);

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}
