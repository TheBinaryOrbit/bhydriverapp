import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
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
  cameraBlocked: string;
  openSettings: string;
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
          onPress: async () => {
            if (!(await ensureCamera(labels))) {
              resolve(null);
              return;
            }
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

/**
 * Android only asks for CAMERA at the moment the driver taps "take photo", and
 * it has to be asked at all *because* the permission is declared in the
 * manifest: with it declared the OS refuses the capture intent outright until
 * it is granted, rather than prompting on the app's behalf. iOS runs its own
 * prompt from inside `launchCamera`, backed by `NSCameraUsageDescription`, so
 * there is nothing to do there — see the `permission` error code in `handle`
 * for what happens when that one is refused.
 *
 * Two refusals and Android starts answering `never_ask_again` without the
 * driver seeing a dialog at all, so that case is handed to the settings app
 * instead of a button that visibly does nothing. A plain refusal is left
 * silent: the driver just said no, and the gallery is still one tap away.
 */
async function ensureCamera(labels: {
  cameraBlocked: string;
  openSettings: string;
  cancel: string;
}): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  const permission = PermissionsAndroid.PERMISSIONS.CAMERA;
  if (await PermissionsAndroid.check(permission)) {
    return true;
  }

  const result = await PermissionsAndroid.request(permission);
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    promptSettings(labels);
  }
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/** The only way back for a driver the OS will no longer prompt. */
function promptSettings(labels: {
  cameraBlocked: string;
  openSettings: string;
  cancel: string;
}): void {
  Alert.alert('', labels.cameraBlocked, [
    { text: labels.cancel, style: 'cancel' },
    { text: labels.openSettings, onPress: () => Linking.openSettings() },
  ]);
}

function handle(
  response: ImagePickerResponse,
  labels: {
    cameraBlocked: string;
    openSettings: string;
    cancel: string;
    invalidType: string;
    tooLarge: string;
    failed: string;
  },
): PickedImage | null {
  if (response.didCancel) {
    return null;
  }
  if (response.errorCode === 'permission') {
    // iOS: the driver refused its prompt, which iOS shows exactly once ever.
    promptSettings(labels);
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
  return typeFromName(asset.fileName);
}

function typeFromName(fileName?: string | null): string {
  const extension = fileName?.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

/**
 * An image already hosted somewhere as an upload-ready `PickedImage`, so a file
 * the driver never picked can still be forwarded to the backend.
 *
 * React Native fetches `http(s)` multipart part URIs itself — Android streams
 * them through `RequestBodyUtil`, iOS through `RCTNetworking`'s HTTP handler —
 * so the remote file goes up as a normal part with no download step here.
 */
export function remoteImage(url: string): PickedImage {
  const name = url.split('?')[0].split('/').pop() || `import-${Date.now()}.jpg`;
  return { uri: url, name, type: typeFromName(name) };
}
