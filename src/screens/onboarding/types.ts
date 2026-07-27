import type { Driver, PickedImage } from '../../types/driver';
import { aadhaarLast4, isoToDob } from '../../utils/validators';

/**
 * The Aadhaar-verified fields KYC hands to onboarding, exactly as `/drivers/me`
 * returns them — `dob` in ISO, `aadharCardNumber` masked. Normalising them is
 * `createEmptyForm`'s job so it only happens in one place.
 */
export type OnboardingPrefill = Pick<
  Driver,
  'name' | 'dob' | 'gender' | 'aadharCardNumber'
>;

/** Fields the driver may not edit, because DigiLocker already vouched for them. */
export type LockedFields = Partial<Record<keyof OnboardingForm, boolean>>;

/** Everything the 3-step onboarding form collects. */
export type OnboardingForm = {
  // Step 1 — personal
  name: string;
  /** Verified at OTP time — read-only from here on. */
  phoneNumber: string;
  /** Masked as `DD/MM/YYYY`; converted to ISO before upload. */
  dob: string;
  email: string;
  gender: string;
  profileImage: PickedImage | null;

  // Step 2 — documents
  /**
   * What the driver *types*: all 12 digits normally, but only the **first 8**
   * when `aadhaarLast4` is set. Use `fullAadhaar()` for the value to submit.
   */
  aadharCardNumber: string;
  /**
   * Last four digits of the KYC-verified Aadhaar, or `''` when KYC didn't
   * supply one. Read-only — it's what the driver's entry gets checked against.
   */
  aadhaarLast4: string;
  dlNumber: string;
  address: string;
  dlFrontImage: PickedImage | null;
  dlBackImage: PickedImage | null;

  // Step 3 — vehicle
  vehicleTypeId: string;
  vehicleNumber: string;
  vehicleName: string;
  ownerName: string;
  seatingCapacity: string;
  manufactureYear: string;
  insuranceExpiryMonth: string;
  insuranceExpiryYear: string;
  vehicleFrontImage: PickedImage | null;
  vehicleSideImage: PickedImage | null;
  vehicleBackImage: PickedImage | null;
  rcFrontImage: PickedImage | null;
  rcBackImage: PickedImage | null;
};

export type FormErrors = Partial<Record<keyof OnboardingForm, string>>;

export type StepProps = {
  form: OnboardingForm;
  errors: FormErrors;
  locked: LockedFields;
  onChange: <K extends keyof OnboardingForm>(
    key: K,
    value: OnboardingForm[K],
  ) => void;
};

/**
 * The 12 digits to submit: the driver's entry with the KYC-verified last four
 * re-attached, so the number that goes up always ends in the four the backend
 * already holds.
 */
export function fullAadhaar(form: OnboardingForm): string {
  return form.aadhaarLast4
    ? `${form.aadharCardNumber}${form.aadhaarLast4}`
    : form.aadharCardNumber;
}

export function createEmptyForm(
  phoneNumber: string,
  prefill?: OnboardingPrefill,
): OnboardingForm {
  return {
    name: prefill?.name ?? '',
    phoneNumber,
    dob: isoToDob(prefill?.dob),
    email: '',
    gender: prefill?.gender ?? '',
    profileImage: null,

    aadharCardNumber: '',
    aadhaarLast4: aadhaarLast4(prefill?.aadharCardNumber),
    dlNumber: '',
    address: '',
    dlFrontImage: null,
    dlBackImage: null,

    vehicleTypeId: '',
    vehicleNumber: '',
    vehicleName: '',
    ownerName: '',
    seatingCapacity: '',
    manufactureYear: '',
    insuranceExpiryMonth: '',
    insuranceExpiryYear: '',
    vehicleFrontImage: null,
    vehicleSideImage: null,
    vehicleBackImage: null,
    rcFrontImage: null,
    rcBackImage: null,
  };
}
