import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export async function pickBookImage(): Promise<string | null> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('Allow photo access to add a Book image.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: true,
    base64: true,
    mediaTypes: ['images'],
    quality: 0.82,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;
  if (asset.base64) return `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`;
  if (asset.uri.startsWith('data:image/')) return asset.uri;
  if (Platform.OS === 'web' && asset.file) return fileAsDataUrl(asset.file);

  throw new Error('The selected image could not be saved for offline use. Choose a JPG, JPEG, or PNG image.');
}

function fileAsDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('Choose a JPG, JPEG, or PNG image.'));

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('The selected image could not be saved for offline use.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('The selected image could not be saved for offline use.'));
    reader.readAsDataURL(file);
  });
}
