import { API, apiError, apiUrl } from './api';
import type { Driver } from '../types/driver';

export type SendOtpResult = {
  sessionId: string;
  message: string;
};

export type VerifyOtpResult = {
  /** 200 = existing driver, 404 = OTP correct but no account yet (onboarding). */
  userStatus: number;
  /** Present only when `userStatus === 200`. */
  token?: string;
  driver?: Driver;
};

/** Requests an OTP for the given phone number. Returns a fresh `sessionId`. */
export async function sendOtp(phoneNumber: string): Promise<SendOtpResult> {
  if (API.useMock) {
    await delay(700);
    return { sessionId: `mock-${Date.now()}`, message: 'OTP sent' };
  }

  const res = await fetch(apiUrl(API.endpoints.getOtp), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.sessionId) {
    throw apiError(data, res.status, 'Failed to send OTP');
  }
  return { sessionId: data.sessionId, message: data.message };
}

/**
 * Verifies the OTP. A wrong/expired code throws; a correct code for an
 * unregistered phone resolves with `userStatus: 404` — that is *not* an error,
 * it means the driver still has to onboard.
 */
export async function verifyOtp(params: {
  phoneNumber: string;
  sessionId: string;
  otp: string;
  fcmToken?: string;
}): Promise<VerifyOtpResult> {
  if (API.useMock) {
    await delay(700);
    // Demo behaviour: OTP "000000" simulates a brand-new driver (onboarding),
    // any other 6-digit code simulates an existing driver (straight to Home).
    if (params.otp === '000000') {
      return { userStatus: 404 };
    }
    return {
      userStatus: 200,
      token: 'mock-token',
      driver: {
        _id: `mock-driver-${params.phoneNumber}`,
        name: 'Mock Driver',
        phoneNumber: params.phoneNumber,
      },
    };
  }

  const res = await fetch(apiUrl(API.endpoints.verifyOtp), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phoneNumber: params.phoneNumber,
      otp: params.otp,
      sessionId: params.sessionId,
      ...(params.fcmToken ? { fcmToken: params.fcmToken } : {}),
      role: API.role,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw apiError(data, res.status, 'Verification failed');
  }
  return { userStatus: data.userStatus, token: data.token, driver: data.user };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
