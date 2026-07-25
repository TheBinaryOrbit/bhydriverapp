/** Driver document returned by `/auth/verify`, `/drivers/onboard` and `/drivers/me`. */
export type Driver = {
  _id: string;
  name: string;
  phoneNumber: string;
  email?: string;
  profileImageUrl?: string;
  dob?: string;
  gender?: Gender;
  address?: string;
  aadharCardNumber?: string;
  dlDetails?: {
    dlNumber?: string;
    dlFrontImageUrl?: string;
    dlBackImageUrl?: string;
  };
  fcmToken?: string;
  /** The only flag the UI branches on — true only when the provider said success. */
  isKycCompleted?: boolean;
  /**
   * Why the last KYC attempt failed, in words meant for the driver (e.g. the
   * Aadhaar is already linked to another account). Null/absent when KYC has
   * never failed — a driver who simply hasn't started has no reason either.
   */
  kycFailedReason?: string | null;
  kycDetails?: KycDetails;
  createdAt?: string;
  updatedAt?: string;
};

export type Gender = 'male' | 'female' | 'other';

/**
 * Aadhaar KYC result written by Signzy's server-to-server callback.
 * `adharFileId` and `aadhaarJpeg` are deliberately not surfaced in the UI —
 * the first is an internal reference, the second is sensitive and its format
 * isn't contractual.
 */
export type KycDetails = {
  /** Provider reference. Safe to show on a failure screen for support. */
  requestId?: string;
  /** Raw provider status (`'success'` or a failure string). For logs, not UI. */
  status?: string;
  adharFileId?: string;
  aadhaarJpeg?: string;
};

/** Entry of `GET /vehicle-types`. */
export type VehicleType = {
  _id: string;
  slug: string;
  name: string;
  description?: string;
  capacity?: number;
  ratePerKm?: number;
  ratePerMinute?: number;
  baseFare?: number;
  icon?: string;
  isActive: boolean;
};

/**
 * Vehicle created alongside the driver during onboarding.
 * `GET /vehicles/my` returns `vehicleTypeId` **populated**; every write expects
 * a plain id string — use `vehicleTypeIdOf()` when echoing it back.
 */
export type Vehicle = {
  _id: string;
  driverId: string;
  vehicleTypeId: string | VehicleType;
  vehicleNumber: string;
  vehicleName?: string;
  ownerName?: string;
  seatingCapacity?: number;
  manufactureYear?: number;
  vehicleImages?: string[];
  rcDetails?: { frontImageUrl?: string; backImageUrl?: string };
  insuranceExpiry?: { month?: number; year?: number };
};

export function vehicleTypeIdOf(vehicle: Vehicle): string {
  return typeof vehicle.vehicleTypeId === 'string'
    ? vehicle.vehicleTypeId
    : (vehicle.vehicleTypeId?._id ?? '');
}

export function vehicleTypeOf(vehicle: Vehicle): VehicleType | null {
  return typeof vehicle.vehicleTypeId === 'object'
    ? vehicle.vehicleTypeId
    : null;
}

/** One UPI id per driver, used for payouts. */
export type PaymentDetails = {
  _id: string;
  driverId: string;
  upiId: string;
  createdAt?: string;
  updatedAt?: string;
};

/** Row of `GET /app-content/driver` — the menu list, without the HTML body. */
export type AppContentSummary = {
  _id: string;
  slug: string;
  name: string;
  /** A MaterialCommunityIcons name. */
  iconName?: string;
  isActive: boolean;
};

/** One page from `GET /app-content/driver/:idOrSlug`, including its HTML. */
export type AppContentPage = AppContentSummary & {
  content: string;
  updatedAt?: string;
};

/** A locally picked image, ready to be appended to a `FormData`. */
export type PickedImage = {
  uri: string;
  name: string;
  type: string;
};
