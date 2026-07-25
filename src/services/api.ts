/**
 * Central API configuration.
 *
 * Endpoints follow `docs/driver-auth-onboarding.md` (base `/api/v3`). Flip
 * `useMock` to `true` to exercise the auth + onboarding UI without a server.
 */
export const API = {
  baseUrl: 'https://08wnx4c4-5000.inc1.devtunnels.ms/api/v3',
  endpoints: {
    getOtp: '/auth/otp',
    verifyOtp: '/auth/verify',
    vehicleTypes: '/vehicle-types',
    driverOnboard: '/drivers/onboard',
    driverMe: '/drivers/me',
    /** Starts a Signzy DigiLocker session. Empty body — driver comes from the token. */
    kycVerify: '/drivers/kyc/verify',
    myVehicles: '/vehicles/my',
    vehicles: '/vehicles',
    myPaymentDetails: '/payment-details/my',
    paymentDetails: '/payment-details',
    /** Driver-app content pages; append `/:idOrSlug` for a single page. */
    appContent: '/app-content/driver',
  },
  /**
   * URLs Signzy redirects the KYC WebView to when the driver finishes.
   *
   * These mirror the backend's `SIGNZY_SUCCESS_URL` / `SIGNZY_FAILURE_URL` env
   * values and **differ per environment** — confirm them with backend for each
   * build. Success and failure currently resolve to the same URL, so hitting
   * one only means "the driver left the flow"; never infer the outcome from
   * which URL was matched. `GET /drivers/me` is the only source of truth.
   */
  kycRedirectUrls: ['https://bharatyaatri.com'] as string[],

  /** Role sent to `/auth/verify` — this is the driver app. */
  role: 'driver',
  /** Set to true to run the flow entirely on-device. */
  useMock: false,
} as const;

export function apiUrl(endpoint: string): string {
  return `${API.baseUrl}${endpoint}`;
}

/** Authorization header for the driver-only routes. */
export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export type FieldError = { field?: string; message?: string };

/** Error carrying the HTTP status and the backend's per-field `errors[]`. */
export class ApiError extends Error {
  status: number;
  fieldErrors: FieldError[];

  constructor(message: string, status: number, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Builds an `ApiError` from a failed response body, preferring the per-field
 * `errors[]` list the backend returns for 400/409 responses.
 */
export function apiError(
  data: any,
  status: number,
  fallback: string,
): ApiError {
  const fieldErrors: FieldError[] = Array.isArray(data?.errors)
    ? data.errors
    : [];
  const message =
    data?.error ??
    data?.message ??
    fieldErrors[0]?.message ??
    fallback;
  return new ApiError(message, status, fieldErrors);
}
