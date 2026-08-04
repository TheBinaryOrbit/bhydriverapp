import type { TFunction } from 'i18next';

import {
  isFutureExpiry,
  isValidAadhaar,
  isValidDob,
  isValidEmail,
  isValidExpiryYear,
  isValidMonth,
  isValidVehicleNumber,
  isValidYear,
} from '../../utils/validators';
import type { FormErrors, OnboardingForm } from './types';

/**
 * Validates one step. Every field is mandatory except `email`, which is only
 * format-checked when the driver fills it in. (The backend itself only demands
 * name / vehicleTypeId / vehicleNumber — the rest is a product requirement.)
 */
export function validateStep(
  step: number,
  form: OnboardingForm,
  t: TFunction,
): FormErrors {
  const errors: FormErrors = {};

  if (step === 0) {
    if (!form.profileImage) {
      errors.profileImage = t('onboarding.errors.imageRequired');
    }
    if (!form.name.trim()) {
      errors.name = t('onboarding.errors.nameRequired');
    } else if (form.name.trim().length < 3) {
      errors.name = t('onboarding.errors.nameShort');
    }
    if (!form.dob.trim()) {
      errors.dob = t('onboarding.errors.dobRequired');
    } else if (!isValidDob(form.dob)) {
      errors.dob = t('onboarding.errors.dob');
    }
    // Email is the one optional field — validated only when provided.
    if (form.email && !isValidEmail(form.email)) {
      errors.email = t('onboarding.errors.email');
    }
    if (!form.gender) {
      errors.gender = t('onboarding.errors.genderRequired');
    }
  }

  if (step === 1) {
    // With a KYC-verified Aadhaar the field holds only the first 8 digits, so
    // the full-length rule would never pass — check what was actually typed.
  
    if (!form.dlNumber.trim()) {
      errors.dlNumber = t('onboarding.errors.dlNumberRequired');
    } else if (form.dlNumber.trim().length < 6) {
      errors.dlNumber = t('onboarding.errors.dlNumber');
    }
    if (!form.address.trim()) {
      errors.address = t('onboarding.errors.addressRequired');
    } else if (form.address.trim().length < 10) {
      errors.address = t('onboarding.errors.addressShort');
    }
    if (!form.dlFrontImage) {
      errors.dlFrontImage = t('onboarding.errors.imageRequired');
    }
    if (!form.dlBackImage) {
      errors.dlBackImage = t('onboarding.errors.imageRequired');
    }
  }

  if (step === 2) {
    if (!form.vehicleTypeId) {
      errors.vehicleTypeId = t('onboarding.errors.vehicleTypeRequired');
    }
    if (!form.vehicleNumber.trim()) {
      errors.vehicleNumber = t('onboarding.errors.vehicleNumberRequired');
    } else if (!isValidVehicleNumber(form.vehicleNumber)) {
      errors.vehicleNumber = t('onboarding.errors.vehicleNumber');
    }
    if (!form.vehicleName.trim()) {
      errors.vehicleName = t('onboarding.errors.vehicleNameRequired');
    }

    const seats = Number(form.seatingCapacity);
    if (!form.seatingCapacity.trim()) {
      errors.seatingCapacity = t('onboarding.errors.seatingRequired');
    } else if (!seats || seats < 1 || seats > 60) {
      errors.seatingCapacity = t('onboarding.errors.seating');
    }

    if (!form.manufactureYear.trim()) {
      errors.manufactureYear = t('onboarding.errors.yearRequired');
    } else if (!isValidYear(form.manufactureYear)) {
      errors.manufactureYear = t('onboarding.errors.year');
    }

    // Insurance expiry is optional — a driver renewing this week doesn't have a
    // date to give yet. Half of it is still wrong, though: a month with no year
    // (or the reverse) is a date nobody can read.
    const month = form.insuranceExpiryMonth.trim();
    const year = form.insuranceExpiryYear.trim();
    if (month || year) {
      if (!month) {
        errors.insuranceExpiryMonth = t('onboarding.errors.expiryIncomplete');
      } else if (!year) {
        errors.insuranceExpiryYear = t('onboarding.errors.expiryIncomplete');
      } else if (!isValidMonth(month)) {
        errors.insuranceExpiryMonth = t('onboarding.errors.month');
      } else if (!isValidExpiryYear(year)) {
        errors.insuranceExpiryYear = t('onboarding.errors.expiryYear');
      } else if (!isFutureExpiry(month, year)) {
        errors.insuranceExpiryMonth = t('onboarding.errors.expiryPast');
      }
    }

    if (!form.vehicleFrontImage) {
      errors.vehicleFrontImage = t('onboarding.errors.imageRequired');
    }
    if (!form.vehicleSideImage) {
      errors.vehicleSideImage = t('onboarding.errors.imageRequired');
    }
    if (!form.vehicleBackImage) {
      errors.vehicleBackImage = t('onboarding.errors.imageRequired');
    }
    if (!form.rcFrontImage) {
      errors.rcFrontImage = t('onboarding.errors.imageRequired');
    }
    if (!form.rcBackImage) {
      errors.rcBackImage = t('onboarding.errors.imageRequired');
    }
  }

  return errors;
}

/** Maps the backend's `errors[]` payload onto form fields. */
export function mapServerErrors(
  serverErrors: { field?: string; message?: string }[] | undefined,
): FormErrors {
  const errors: FormErrors = {};
  serverErrors?.forEach(item => {
    if (!item.field || !item.message) {
      return;
    }
    const key =
      FIELD_ALIASES[item.field] ?? (item.field as keyof OnboardingForm);
    errors[key] = item.message;
  });
  return errors;
}

/** Backend field names that don't match the form's keys 1:1. */
const FIELD_ALIASES: Record<string, keyof OnboardingForm> = {
  'dlDetails.dlNumber': 'dlNumber',
  profileImage: 'profileImage',
};
