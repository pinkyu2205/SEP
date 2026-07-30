import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, TenantContractProvider } from './src/hooks';
import { RootNavigator } from './src/navigation';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <TenantContractProvider>
          <StatusBar style="auto" />
          <RootNavigator />
        </TenantContractProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
