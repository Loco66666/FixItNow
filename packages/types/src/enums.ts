export enum UserRole {
  CUSTOMER = "CUSTOMER",
  PROFESSIONAL = "PROFESSIONAL",
  ADMIN = "ADMIN",
}

export enum ProfessionalType {
  INDEPENDENT = "INDEPENDENT",
  GARAGE = "GARAGE",
  BREAKDOWN_PROVIDER = "BREAKDOWN_PROVIDER",
  SPECIALIST = "SPECIALIST",
}

export enum InterventionUrgency {
  NORMAL = "NORMAL",
  URGENT = "URGENT",
  EMERGENCY = "EMERGENCY",
}

/**
 * Where the intervention physically takes place. Matters for legal/pricing
 * rules: on highways and express roads only authorized providers may attend,
 * and regulated tariffs apply.
 */
export enum InterventionLocationContext {
  HOME = "HOME",
  PARKING = "PARKING",
  ROAD = "ROAD",
  BUSINESS = "BUSINESS",
  HIGHWAY = "HIGHWAY",
  EXPRESS_ROAD = "EXPRESS_ROAD",
}

export enum InterventionStatus {
  REQUESTED = "REQUESTED",
  SEARCHING = "SEARCHING",
  OFFERED = "OFFERED",
  ACCEPTED = "ACCEPTED",
  EN_ROUTE = "EN_ROUTE",
  ARRIVED = "ARRIVED",
  DIAGNOSING = "DIAGNOSING",
  QUOTE_PENDING = "QUOTE_PENDING",
  QUOTE_ACCEPTED = "QUOTE_ACCEPTED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  PAYMENT_PENDING = "PAYMENT_PENDING",
  PAID = "PAID",
  RATED = "RATED",
  CANCELLED = "CANCELLED",
  DECLINED = "DECLINED",
  EXPIRED = "EXPIRED",
  NO_SHOW = "NO_SHOW",
  DISPUTED = "DISPUTED",
  FAILED = "FAILED",
}

export enum InterventionOfferStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  DECLINED = "DECLINED",
  EXPIRED = "EXPIRED",
  CANCELLED = "CANCELLED",
}

/**
 * Lifecycle of a matching candidate row produced by the matching engine
 * (PHASE 04). A re-run of the matching supersedes stale PENDING rows.
 */
export enum MatchCandidateStatus {
  PENDING = "PENDING",
  NOTIFIED = "NOTIFIED",
  ACCEPTED = "ACCEPTED",
  DECLINED = "DECLINED",
  EXPIRED = "EXPIRED",
  SUPERSEDED = "SUPERSEDED",
}

export enum AvailabilityStatus {
  AVAILABLE_NOW = "AVAILABLE_NOW",
  AVAILABLE_SOON = "AVAILABLE_SOON",
  AVAILABLE_TODAY = "AVAILABLE_TODAY",
  APPOINTMENT = "APPOINTMENT",
  UNAVAILABLE = "UNAVAILABLE",
}

export enum VerificationStatus {
  NOT_STARTED = "NOT_STARTED",
  IN_PROGRESS = "IN_PROGRESS",
  SUBMITTED = "SUBMITTED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export enum VerificationDocumentStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  EXPIRED = "EXPIRED",
}

export enum QuoteStatus {
  DRAFT = "DRAFT",
  SENT = "SENT",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
  EXPIRED = "EXPIRED",
  CANCELLED = "CANCELLED",
}

export enum PaymentStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  PAID = "PAID",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
  PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED",
}

export enum MessageType {
  TEXT = "TEXT",
  FILE = "FILE",
  SYSTEM = "SYSTEM",
}

export enum NotificationType {
  INTERVENTION = "INTERVENTION",
  MESSAGE = "MESSAGE",
  PAYMENT = "PAYMENT",
  QUOTE = "QUOTE",
  SYSTEM = "SYSTEM",
}
