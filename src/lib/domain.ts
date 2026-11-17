// Shared vocabulary, error type and small pure helpers. No I/O here.

export class AppError extends Error {
  constructor(
    message: string,
    public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT" | "UNAUTHENTICATED" = "INVALID",
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}
export const forbidden = (m = "You do not have permission for this action.") => new AppError(m, "FORBIDDEN");
export const notFound = (m = "Not found.") => new AppError(m, "NOT_FOUND");
export const invalid = (m: string, fe?: Record<string, string>) => new AppError(m, "INVALID", fe);
export const conflict = (m: string) => new AppError(m, "CONFLICT");

export const TENANT_KINDS = ["SUPERMARKET", "RESTAURANT", "RECIPIENT", "LOGISTICS"] as const;
export type TenantKind = (typeof TENANT_KINDS)[number];

export const RECIPIENT_CATEGORIES: Record<string, string> = {
  NGO: "Registered NGO or charitable trust",
  FOOD_BANK: "Food bank or surplus-food distribution organisation",
  COMMUNITY_KITCHEN: "Community kitchen or free-meal programme",
  SHELTER: "Homeless shelter or relief shelter",
  CHILD_WELFARE: "Children's home or child welfare organisation",
  ELDER_CARE: "Elder-care home",
  SCHOOL: "Government school or approved charitable education programme",
  HOSPITAL: "Government hospital or approved charitable hospital programme",
  DISASTER_RELIEF: "Disaster-relief organisation",
  OTHER: "Other community organisation (manual review)",
};
/** Categories where a programme description and dietary restrictions are mandatory. */
export const PROGRAMME_REQUIRED = ["HOSPITAL", "CHILD_WELFARE", "SCHOOL", "ELDER_CARE"];
/** Suggested evidence differs by category; none is a universal rule. */
export const EVIDENCE_HINT: Record<string, string> = {
  NGO: "Trust/society/Section 8 registration details",
  FOOD_BANK: "Registration details or letter from a partner institution",
  COMMUNITY_KITCHEN: "Registration or letter from the running body",
  SHELTER: "Registration or municipal/authority letter",
  CHILD_WELFARE: "Registration under applicable child-welfare law or authority letter",
  ELDER_CARE: "Registration or licence details",
  SCHOOL: "Institutional authorisation letter from the head of institution",
  HOSPITAL: "Institutional authorisation letter naming the programme",
  DISASTER_RELIEF: "Registration or deployment/authority letter",
  OTHER: "Any document explaining who you are; reviewed manually",
};

export const ORG_ROLES = ["OWNER", "COORDINATOR", "VIEWER", "DRIVER"] as const;
export const SUPPLIER_ROLES = ["OWNER", "MANAGER", "OPERATOR", "VIEWER"] as const;
export const roleLabel: Record<string, string> = {
  OWNER: "Owner / POC",
  COORDINATOR: "Coordinator",
  VIEWER: "Read-only viewer",
  DRIVER: "Organisation driver",
  MANAGER: "Manager",
  OPERATOR: "Operator",
};

export const UNITS = ["PLATES", "KG", "LITRES", "PIECES", "PORTIONS"] as const;
export type Unit = (typeof UNITS)[number];
export const unitLabel: Record<string, string> = {
  PLATES: "complete-meal plates",
  KG: "kg",
  LITRES: "litres",
  PIECES: "pieces",
  PORTIONS: "component portions",
  ITEM: "items",
  LITRE: "litres",
  PACK: "packs",
};
export const ALLERGENS = ["gluten", "milk", "egg", "peanut", "tree_nut", "soy", "fish", "shellfish", "sesame", "mustard"] as const;
export const DIETS = ["VEG", "NONVEG", "VEGAN"] as const;
export const MEAL_SLOTS = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;
export const PURPOSES: Record<string, string> = {
  REGULAR_MEALS: "Regular meals",
  COMMUNITY_DISTRIBUTION: "One-time community distribution",
  SHELTER_PROGRAMME: "Shelter programme",
  INSTITUTIONAL: "Authorised institutional programme",
  RELIEF: "Relief activity",
};

// Allowed status transitions (enforced in services).
export const VERIFICATION_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED", "CHANGES_REQUESTED", "REJECTED"],
  CHANGES_REQUESTED: ["SUBMITTED"],
  REJECTED: [],
  APPROVED: ["SUSPENDED"],
  SUSPENDED: ["APPROVED"],
};
export const JOB_TRANSITIONS: Record<string, string[]> = {
  PLANNING: ["AWAITING_FUNDING", "ASSIGNED", "CANCELLED"],
  AWAITING_FUNDING: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["ACCEPTED", "CANCELLED", "FAILED"],
  ACCEPTED: ["AT_PICKUP", "CANCELLED", "FAILED"],
  AT_PICKUP: ["COLLECTED", "FAILED"],
  COLLECTED: ["IN_TRANSIT", "FAILED"],
  IN_TRANSIT: ["DELIVERED", "FAILED"],
  DELIVERED: ["COMPLETED", "PARTIALLY_COMPLETED"],
  COMPLETED: [],
  PARTIALLY_COMPLETED: [],
  CANCELLED: [],
  FAILED: [],
};
export function assertTransition(map: Record<string, string[]>, from: string, to: string) {
  if (!map[from]?.includes(to)) throw conflict(`Cannot move from ${from} to ${to}.`);
}

export const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};
