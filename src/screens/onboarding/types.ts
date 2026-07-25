import type { PickedImage } from '../../types/driver';

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
  aadharCardNumber: string;
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
};

export type FormErrors = Partial<Record<keyof OnboardingForm, string>>;

export type StepProps = {
  form: OnboardingForm;
  errors: FormErrors;
  onChange: <K extends keyof OnboardingForm>(
    key: K,
    value: OnboardingForm[K],
  ) => void;
};

export function createEmptyForm(phoneNumber: string): OnboardingForm {
  return {
    name: '',
    phoneNumber,
    dob: '',
    email: '',
    gender: '',
    profileImage: null,

    aadharCardNumber: '',
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
  };
}
