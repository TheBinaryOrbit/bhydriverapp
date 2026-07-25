import { Alert } from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  type Asset,
  type ImagePickerResponse,
} from 'react-native-image-picker';

import type { PickedImage } from '../types/driver';

/** Backend rules: jpeg / jpg / png / webp only, 5 MB max per file. */
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const OPTIONS = {
  mediaType: 'photo',
  quality: 0.8,
  maxWidth: 1600,
  maxHeight: 1600,
  includeExtra: true,
} as const;

/**
 * Asks the driver to shoot or pick a photo, then validates it against the
 * upload rules. Resolves `null` when cancelled or rejected (a toast/alert has
 * already been shown in the rejected case).
 */
export function pickImage(labels: {
  title: string;
  camera: string;
  gallery: string;
  cancel: string;
  invalidType: string;
  tooLarge: string;
  failed: string;
}): Promise<PickedImage | null> {
  return new Promise(resolve => {
    Alert.alert(
      labels.title,
      undefined,
      [
        {
          text: labels.camera,
          onPress: () => {
            launchCamera({ ...OPTIONS, saveToPhotos: false }, response =>
              resolve(handle(response, labels)),
            );
          },
        },
        {
          text: labels.gallery,
          onPress: () => {
            launchImageLibrary({ ...OPTIONS, selectionLimit: 1 }, response =>
              resolve(handle(response, labels)),
            );
          },
        },
        {
          text: labels.cancel,
          style: 'cancel',
          onPress: () => resolve(null),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

function handle(
  response: ImagePickerResponse,
  labels: { invalidType: string; tooLarge: string; failed: string },
): PickedImage | null {
  if (response.didCancel) {
    return null;
  }
  if (response.errorCode) {
    Alert.alert('', response.errorMessage || labels.failed);
    return null;
  }

  const asset = response.assets?.[0];
  if (!asset?.uri) {
    return null;
  }

  const type = (asset.type || guessType(asset)).toLowerCase();
  if (!ALLOWED_TYPES.includes(type)) {
    Alert.alert('', labels.invalidType);
    return null;
  }
  if (asset.fileSize && asset.fileSize > MAX_BYTES) {
    Alert.alert('', labels.tooLarge);
    return null;
  }

  return {
    // Android content:// and iOS file:// URIs are both uploadable as-is.
    uri: asset.uri,
    name: asset.fileName || `upload-${Date.now()}.${type.split('/')[1]}`,
    type,
  };
}

function guessType(asset: Asset): string {
  const extension = asset.fileName?.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}
