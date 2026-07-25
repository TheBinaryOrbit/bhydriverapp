import { API, apiError, apiUrl, bearer } from './api';
import type { Driver, PickedImage, Vehicle, VehicleType } from '../types/driver';

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
};

export type OnboardResult = {
  token: string;
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
 * Creates the driver **and** their first vehicle in one multipart call, then
 * returns the JWT. The call is atomic server-side, so it is safe to retry the
 * whole form after a failure.
 */
export async function onboardDriver(
  payload: OnboardPayload,
): Promise<OnboardResult> {
  if (API.useMock) {
    await delay(1200);
    return {
      token: 'mock-token',
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

  // Don't set Content-Type — the boundary has to come from the HTTP client.
  const res = await fetch(apiUrl(API.endpoints.driverOnboard), {
    method: 'POST',
    body: form,
  });

  const data = await res.json().catch(() => null);
  if (res.status !== 201 || !data?.token) {
    throw apiError(data, res.status, 'Failed to onboard driver');
  }
  return { token: data.token, driver: data.driver, vehicle: data.vehicle };
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
