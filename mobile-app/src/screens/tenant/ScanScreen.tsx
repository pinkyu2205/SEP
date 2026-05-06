import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, ScrollView, TextInput } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../constants';
import { useNavigation } from '@react-navigation/native';

export const ScanScreen: React.FC = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  
  const navigation = useNavigation();

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Chúng tôi cần quyền truy cập Camera để quét mã QR dán trên thiết bị.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Cấp quyền Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (scannedData) return; // Chỉ quét 1 lần
    setScannedData(data);
    // Ở hệ thống thật, data này là mã QR (VD: EQ-101-AC), sau đó gọi API lấy thông tin
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
    });

    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
    });

    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleSubmit = () => {
    if (!description) {
      Alert.alert('Lỗi', 'Vui lòng nhập mô tả sự cố');
      return;
    }
    
    Alert.alert(
      'Thành công', 
      `Đã gửi báo hỏng cho thiết bị ${scannedData}.\nQuản lý sẽ sớm liên hệ với bạn!`,
      [{ text: 'OK', onPress: () => {
        setScannedData(null);
        setPhoto(null);
        setDescription('');
        navigation.navigate('MaintenanceList' as never);
      }}]
    );
  };

  if (!scannedData) {
    return (
      <View style={styles.container}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
        >
          <View style={styles.overlay}>
            <View style={styles.scanBox} />
            <Text style={styles.scanText}>Di chuyển Camera đến mã QR trên thiết bị</Text>
          </View>
        </CameraView>
        
        {/* Nút hủy để quay lại tab trước */}
        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Hủy</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.formContainer} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>Báo cáo sự cố thiết bị</Text>
      
      <View style={styles.card}>
        <Text style={styles.label}>Thiết bị đang báo hỏng:</Text>
        <Text style={styles.equipmentName}>Điều hòa Daikin 9000BTU</Text>
        <Text style={styles.equipmentCode}>Mã: {scannedData}</Text>
      </View>

      <Text style={styles.label}>Hình ảnh hiện trạng:</Text>
      <View style={styles.imageRow}>
        <TouchableOpacity style={styles.imageAction} onPress={takePhoto}>
          <Text style={styles.emoji}>📷</Text>
          <Text style={styles.actionText}>Chụp ảnh</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.imageAction} onPress={pickImage}>
          <Text style={styles.emoji}>🖼️</Text>
          <Text style={styles.actionText}>Thư viện</Text>
        </TouchableOpacity>
      </View>

      {photo && (
        <Image source={{ uri: photo }} style={styles.previewImage} />
      )}

      <Text style={styles.label}>Mô tả sự cố:</Text>
      <TextInput
        style={styles.input}
        placeholder="Ví dụ: Điều hòa không mát, kêu to..."
        multiline
        numberOfLines={4}
        value={description}
        onChangeText={setDescription}
      />

      <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
        <Text style={styles.submitBtnText}>Gửi báo cáo</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.rescanBtn} onPress={() => setScannedData(null)}>
        <Text style={styles.rescanText}>Quét lại mã QR khác</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    textAlign: 'center',
    paddingBottom: 20,
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 30,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanBox: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: 'transparent',
    borderRadius: 12,
  },
  scanText: {
    color: '#fff',
    marginTop: 20,
    fontSize: 16,
    fontWeight: '600',
  },
  cancelBtn: {
    position: 'absolute',
    bottom: 40,
    padding: 15,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 30,
    width: 120,
    alignItems: 'center',
  },
  cancelText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  // Form styles
  formContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 20,
    marginTop: 20,
  },
  card: {
    backgroundColor: Colors.white,
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  label: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 8,
    fontWeight: '600',
  },
  equipmentName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  equipmentCode: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
  },
  imageRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  imageAction: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.divider,
    borderStyle: 'dashed',
  },
  emoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  actionText: {
    color: Colors.text,
    fontWeight: '500',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 20,
  },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    color: Colors.text,
    textAlignVertical: 'top',
    marginBottom: 24,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  rescanBtn: {
    padding: 16,
    alignItems: 'center',
  },
  rescanText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
