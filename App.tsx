import React, { useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import SearchScreen from './src/screens/SearchScreen';
import PlannerScreen from './src/screens/PlannerScreen';
import NearbyScreen from './src/screens/NearbyScreen';
import StopDetailsScreen from './src/screens/StopDetailsScreen';
import RouteDetailsScreen from './src/screens/RouteDetailsScreen';
import LegalScreen from './src/screens/LegalScreen';
import AgeGate from './src/screens/AgeGate';
import { colors } from './src/theme';
import type { RootStackParamList } from './src/navigation/types';
import ErrorBoundary from './src/components/ErrorBoundary';

const Stack=createNativeStackNavigator<RootStackParamList>();
const navTheme={...DefaultTheme,colors:{...DefaultTheme.colors,background:colors.background,card:colors.surface,text:colors.text,border:colors.border,primary:colors.accent}};

export default function App(){
  const [consentGiven,setConsentGiven]=useState(false);
  if(!consentGiven)return <ErrorBoundary><SafeAreaProvider><AgeGate onConfirm={()=>setConsentGiven(true)}/></SafeAreaProvider></ErrorBoundary>;
  return <ErrorBoundary><SafeAreaProvider><NavigationContainer theme={navTheme}>
    <Stack.Navigator screenOptions={{headerShown:false}}>
      <Stack.Screen name="Home" component={HomeScreen}/>
      <Stack.Screen name="Search" component={SearchScreen} options={{presentation:'modal'}}/>
      <Stack.Screen name="Planner" component={PlannerScreen}/>
      <Stack.Screen name="Nearby" component={NearbyScreen}/>
      <Stack.Screen name="StopDetails" component={StopDetailsScreen}/>
      <Stack.Screen name="RouteDetails" component={RouteDetailsScreen}/>
      <Stack.Screen name="Legal" component={LegalScreen}/>
    </Stack.Navigator>
  </NavigationContainer></SafeAreaProvider></ErrorBoundary>;
}
