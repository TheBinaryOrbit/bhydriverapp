import {
  API,
  apiError,
  apiUrl,
  bearer,
  legacyApiUrl,
  legacyAssetUrl,
} from './api';
import type {
  Driver,
  LegacyVehicle,
  PickedImage,
  Vehicle,
  VehicleType,
} from '../types/driver';

export type OnboardPayload = {
  // Step 1 — personal
  name: string;
  phoneNumber: string;
  dob?: string;
  email?: string;
  gender?: string;
  profileImage?: PickedImage | null;

  // Step 2 — documents
  aadharCardNumber?: string;
  dlNumber?: string;
  address?: string;
  dlFrontImage?: PickedImage | null;
  dlBackImage?: PickedImage | null;

  // Step 3 — vehicle
  vehicleTypeId: string;
  vehicleNumber: string;
  vehicleName?: string;
  ownerName?: string;
  seatingCapacity?: string;
  manufactureYear?: string;
  insuranceExpiryMonth?: string;
  insuranceExpiryYear?: string;
  /** Front / side / back, in that order. Up to 3, all optional. */
  vehicleImages?: (PickedImage | null)[];
  rcFrontImage?: PickedImage | null;
  rcBackImage?: PickedImage | null;
};

/**
 * `201 { message, role, driver, vehicle }`.
 *
 * No token comes back — the driver already has one from KYC, which is what
 * created the record this call fills in. Keep using that one.
 */
export type OnboardResult = {
  driver: Driver;
  vehicle: Vehicle;
};

/** Active vehicle types for the onboarding picker. */
export async function fetchVehicleTypes(): Promise<VehicleType[]> {
  if (API.useMock) {
    await delay(400);
    return [];
  }

  const res = await fetch(apiUrl(API.endpoints.vehicleTypes));
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(data, res.status, 'Failed to load vehicle types');
  }
  const list: VehicleType[] = Array.isArray(data?.data) ? data.data : [];
  return list.filter(type => type.isActive);
}

/**
 * Vehicles the legacy v2 API holds for a phone number, in the order it lists
 * them.
 *
 * Unauthenticated, and takes the phone number rather than a token, because it
 * runs during onboarding — the v3 account exists but has no v2 identity to
 * present. An empty list is a normal answer: most drivers are new.
 */
export async function fetchLegacyVehicles(
  phoneNumber: string,
): Promise<LegacyVehicle[]> {
  const phone = phoneNumber.replace(/\D/g, '').slice(-10);
  if (phone.length !== 10) {
    return [];
  }

  const res = await fetch(
    legacyApiUrl(`${API.legacyEndpoints.vehiclesByPhone}/${phone}`),
  );
  const data = await res.json().catch(() => null);

  // A number v2 has never seen comes back as `500 Internal Server Error`, so
  // the status can't tell "nothing to import" apart from "v2 is unwell". Both
  // are reported as an empty list: a driver who is simply new must not be shown
  // a server error, and there is nothing to import either way. A dead network
  // still rejects, which is the case worth reporting.
  if (!res.ok) {
    return [];
  }

  const list = Array.isArray(data?.vehicle) ? data.vehicle : [];
  return list.map((entry: any) => ({
    _id: String(entry?._id ?? ''),
    vehicleType: entry?.vehicleType,
    registrationNumber: entry?.registrationNumber,
    yearOfManufacture: entry?.yearOfManufacture
      ? String(entry.yearOfManufacture)
      : undefined,
    insuranceExpDate: entry?.insuranceExpDate,
    vehicleImageUrls: legacyImageUrls(entry, LEGACY_IMAGE_KEYS.photos),
    rcFrontImageUrl: legacyImageUrls(entry, LEGACY_IMAGE_KEYS.rcFront)[0],
    rcBackImageUrl: legacyImageUrls(entry, LEGACY_IMAGE_KEYS.rcBack)[0],
  }));
}

/**
 * The v2 keys each imported photo can arrive under, most specific first.
 *
 * v2 names these differently from v3 and has no schema doc, so every spelling
 * it is known to use is listed rather than assumed. A key that isn't there
 * simply yields nothing and the driver photographs that document themselves —
 * exactly what happened before images were imported at all.
 */
const LEGACY_IMAGE_KEYS = {
  photos: [
    'vehicleImages',
    'vehicleImage',
    'vehiclePhotos',
    'carImages',
    'carImage',
    'images',
    'image',
  ],
  rcFront: ['rcFrontImage', 'rcFrontPhoto', 'rcFront', 'rcImage', 'rc'],
  rcBack: ['rcBackImage', 'rcBackPhoto', 'rcBack'],
};

/**
 * Absolute URLs for the first of `keys` the entry actually carries. v2 uses
 * both a bare string and an array of them depending on the field, so both are
 * flattened to a list.
 */
function legacyImageUrls(entry: any, keys: string[]): string[] {
  for (const key of keys) {
    const value = entry?.[key];
    const urls = (Array.isArray(value) ? value : [value])
      .map((item: unknown) =>
        typeof item === 'string' ? legacyAssetUrl(item) : undefined,
      )
      .filter((url: string | undefined): url is string => Boolean(url));
    if (urls.length > 0) {
      return urls;
    }
  }
  return [];
}

/**
 * Creates the driver **and** their first vehicle in one multipart call, then
 * returns the JWT. The call is atomic server-side, so it is safe to retry the
 * whole form after a failure.
 */
export async function onboardDriver(
  payload: OnboardPayload,
  token: string,
): Promise<OnboardResult> {
  if (API.useMock) {
    await delay(1200);
    return {
      driver: {
        _id: `mock-driver-${payload.phoneNumber}`,
        name: payload.name,
        phoneNumber: payload.phoneNumber,
      },
      vehicle: {
        _id: 'mock-vehicle',
        driverId: `mock-driver-${payload.phoneNumber}`,
        vehicleTypeId: payload.vehicleTypeId,
        vehicleNumber: payload.vehicleNumber,
      },
    };
  }

  const form = new FormData();

  appendText(form, 'name', payload.name);
  appendText(form, 'phoneNumber', payload.phoneNumber);
  appendText(form, 'vehicleTypeId', payload.vehicleTypeId);
  appendText(form, 'vehicleNumber', payload.vehicleNumber.toUpperCase());

  appendText(form, 'email', payload.email);
  appendText(form, 'dob', payload.dob);
  appendText(form, 'gender', payload.gender);
  appendText(form, 'address', payload.address);
  appendText(form, 'aadharCardNumber', payload.aadharCardNumber);
  appendText(form, 'dlNumber', payload.dlNumber);

  appendText(form, 'vehicleName', payload.vehicleName);
  appendText(form, 'ownerName', payload.ownerName);
  appendText(form, 'seatingCapacity', payload.seatingCapacity);
  appendText(form, 'manufactureYear', payload.manufactureYear);
  appendText(form, 'insuranceExpiryMonth', payload.insuranceExpiryMonth);
  appendText(form, 'insuranceExpiryYear', payload.insuranceExpiryYear);

  appendFile(form, 'profileImage', payload.profileImage);
  appendFile(form, 'dlFrontImage', payload.dlFrontImage);
  appendFile(form, 'dlBackImage', payload.dlBackImage);
  // Repeat the same field name for each vehicle photo (max 3).
  payload.vehicleImages?.forEach(image => {
    appendFile(form, 'vehicleImages', image);
  });
  appendFile(form, 'rcFrontImage', payload.rcFrontImage);
  appendFile(form, 'rcBackImage', payload.rcBackImage);

  // Don't set Content-Type — the boundary has to come from the HTTP client.
  const res = await fetch(apiUrl(API.endpoints.driverOnboard), {
    method: 'POST',
    headers: bearer(token),
    body: form,
  });

  const data = await res.json().catch(() => null);
  if (res.status !== 201 || !data?.driver) {
    throw apiError(data, res.status, 'Failed to onboard driver');
  }
  return { driver: data.driver, vehicle: data.vehicle };
}

/** The logged-in driver's profile. Use on launch to refresh the cache. */
export async function fetchMe(token: string): Promise<Driver> {
  const res = await fetch(apiUrl(API.endpoints.driverMe), {
    headers: bearer(token),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(data, res.status, 'Failed to load profile');
  }
  return data.driver ?? data.user ?? data;
}

/** Text fields `PATCH /drivers/me` accepts. `phoneNumber` is not editable. */
export type ProfileChanges = {
  name?: string;
  email?: string;
  /** `YYYY-MM-DD`. */
  dob?: string;
  gender?: string;
  address?: string;
  aadharCardNumber?: string;
  dlNumber?: string;
  profileImage?: PickedImage | null;
  dlFrontImage?: PickedImage | null;
  dlBackImage?: PickedImage | null;
};

/**
 * Partial profile update — pass only what the driver actually changed. The
 * server replies with the full updated driver; cache that, don't patch locally.
 * An empty `changes` object would be a 400, so callers must check dirtiness.
 */
export async function updateProfile(
  token: string,
  changes: ProfileChanges,
): Promise<Driver> {
  const form = new FormData();

  appendText(form, 'name', changes.name);
  appendText(form, 'email', changes.email);
  appendText(form, 'dob', changes.dob);
  appendText(form, 'gender', changes.gender);
  appendText(form, 'address', changes.address);
  appendText(form, 'aadharCardNumber', changes.aadharCardNumber);
  appendText(form, 'dlNumber', changes.dlNumber);

  appendFile(form, 'profileImage', changes.profileImage);
  appendFile(form, 'dlFrontImage', changes.dlFrontImage);
  appendFile(form, 'dlBackImage', changes.dlBackImage);

  const res = await fetch(apiUrl(API.endpoints.driverMe), {
    method: 'PATCH',
    headers: bearer(token),
    body: form,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.driver) {
    throw apiError(data, res.status, 'Failed to update profile');
  }
  return data.driver;
}

function appendText(form: FormData, key: string, value?: string): void {
  const trimmed = value?.trim();
  if (trimmed) {
    form.append(key, trimmed);
  }
}

function appendFile(
  form: FormData,
  key: string,
  image?: PickedImage | null,
): void {
  if (image?.uri) {
    form.append(key, image as unknown as Blob);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
