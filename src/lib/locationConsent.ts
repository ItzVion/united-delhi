import { Alert } from 'react-native';

export async function confirmLocationUse(): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      'Use your location?',
      'United Delhi uses your foreground location to find nearby bus stops and centre the map. A reduced-precision location may be sent to the United Delhi server for nearby-stop lookup.',
      [
        { text:'Not now', style:'cancel', onPress:()=>resolve(false) },
        { text:'Continue', onPress:()=>resolve(true) }
      ],
      { cancelable:false }
    );
  });
}
