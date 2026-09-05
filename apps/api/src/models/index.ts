export { User } from "./User";
export { Category } from "./Category";
export { Business } from "./Business";
export { Booking } from "./Booking";
export { Review } from "./Review";

// Automotive domain models (migrated from `./automotive/index.ts` re-exports
// so automotive services can import from a single barrel).
export {
  Vehicle,
  Professional,
  Garage,
  Skill,
  ProfessionalSkill,
  ServiceArea,
  Availability,
  Intervention,
  InterventionStatusHistory,
  InterventionType,
  InterventionOffer,
  Diagnosis,
  Quote,
  QuoteItem,
  Payment,
  Invoice,
  Review as AutomotiveReview,
  Conversation,
  Message,
  Notification,
  VerificationDocument,
  ProfessionalVerification,
  Report,
  Media,
} from "./automotive";
