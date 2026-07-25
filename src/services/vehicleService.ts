import { API, apiError, apiUrl, bearer } from './api';
import type { PickedImage, Vehicle } from '../types/driver';

/** Fields `POST /vehicles` and `PATCH /vehicles/:id` accept. */
export type VehicleChanges = {
  /** `_id` or `slug` — never the populated object from `GET /vehicles/my`. */
  vehicleTypeId?: string;
  vehicleNumber?: string;
  vehicleName?: string;
  ownerName?: string;
  seatingCapacity?: string;
  manufactureYear?: string;
  insuranceExpiryMonth?: string;
  insuranceExpiryYear?: string;
  /** Replaces the **entire** array — re-upload photos you want to keep. */
  vehicleImages?: (PickedImage | null)[];
  rcFrontImage?: PickedImage | null;
  rcBackImage?: PickedImage | null;
};

/**
 * The signed-in driver's vehicles, with `vehicleTypeId` populated. A driver may
 * own exactly one, so callers take `[0]`; the endpoint stays a list because
 * that's the API's shape.
 */
export async function fetchMyVehicles(token: string): Promise<Vehicle[]> {
  const res = await fetch(apiUrl(API.endpoints.myVehicles), {
    headers: bearer(token),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(data, res.status, 'Failed to load vehicles');
  }
  return Array.isArray(data?.data) ? data.data : [];
}

/** Partial update. An empty `changes` object is a 400 — check dirtiness first. */
export async function updateVehicle(
  token: string,
  vehicleId: string,
  changes: VehicleChanges,
): Promise<Vehicle> {
  const res = await fetch(`${apiUrl(API.endpoints.vehicles)}/${vehicleId}`, {
    method: 'PATCH',
    headers: bearer(token),
    body: buildForm(changes),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.vehicle) {
    throw apiError(data, res.status, 'Failed to update vehicle');
  }
  return data.vehicle;
}

/**
 * Creates the driver's one vehicle. Onboarding normally does this, so it is
 * only a recovery path for a driver who somehow has none.
 * `vehicleTypeId` and `vehicleNumber` are required here.
 */
export async function createVehicle(
  token: string,
  changes: VehicleChanges,
): Promise<Vehicle> {
  const res = await fetch(apiUrl(API.endpoints.vehicles), {
    method: 'POST',
    headers: bearer(token),
    body: buildForm(changes),
  });

  const data = await res.json().catch(() => null);
  if (res.status !== 201 || !data?.vehicle) {
    throw apiError(data, res.status, 'Failed to add vehicle');
  }
  return data.vehicle;
}

function buildForm(changes: VehicleChanges): FormData {
  const form = new FormData();

  appendText(form, 'vehicleTypeId', changes.vehicleTypeId);
  appendText(form, 'vehicleNumber', changes.vehicleNumber?.toUpperCase());
  appendText(form, 'vehicleName', changes.vehicleName);
  appendText(form, 'ownerName', changes.ownerName);
  appendText(form, 'seatingCapacity', changes.seatingCapacity);
  appendText(form, 'manufactureYear', changes.manufactureYear);
  appendText(form, 'insuranceExpiryMonth', changes.insuranceExpiryMonth);
  appendText(form, 'insuranceExpiryYear', changes.insuranceExpiryYear);

  changes.vehicleImages?.forEach(image => {
    appendFile(form, 'vehicleImages', image);
  });
  appendFile(form, 'rcFrontImage', changes.rcFrontImage);
  appendFile(form, 'rcBackImage', changes.rcBackImage);

  return form;
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
