import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './src/screens/HomeScreen';
import SearchScreen from './src/screens/SearchScreen';
import StopDetailsScreen from './src/screens/StopDetailsScreen';
import RouteDetailsScreen from './src/screens/RouteDetailsScreen';
import { colors } from './src/theme';
import type { RootStackParamList } from './src/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navTheme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.background, card: colors.background } };

export default function App() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Search" component={SearchScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="StopDetails" component={StopDetailsScreen} />
        <Stack.Screen name="RouteDetails" component={RouteDetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}