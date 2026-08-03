import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, TenantContractProvider } from './src/hooks';
import { RootNavigator } from './src/navigation';
import { AlertHost } from './src/components/common';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <TenantContractProvider>
          <StatusBar style="auto" />
          <RootNavigator />
          {/* Nơi hiển thị mọi thông báo showAlert() — phải nằm cuối để đè lên các màn. */}
          <AlertHost />
        </TenantContractProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
