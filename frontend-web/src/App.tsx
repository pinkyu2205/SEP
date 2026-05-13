import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AdminLayout } from './layouts/AdminLayout';
import { Dashboard } from './pages/dashboard/Dashboard';
import { PropertyList } from './pages/properties/PropertyList';
import { PropertyDetail } from './pages/properties/PropertyDetail';
import { TenantList } from './pages/tenants/TenantList';
import { ManagerList } from './pages/managers/ManagerList'; // Kept but not in sidebar
import { ContractList } from './pages/contracts/ContractList';
import { EquipmentList } from './pages/equipments/EquipmentList';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<Dashboard />} />

          {/* Quản lý Bất động sản */}
          <Route path="/properties" element={<PropertyList />} />
          <Route path="/properties/:id" element={<PropertyDetail />} />

          {/* Quản lý Khách thuê */}
          <Route path="/tenants" element={<TenantList />} />
          
          {/* Quản lý cho thuê (Managers đang thuê nhà - được truy cập từ sidebar nhưng hiển thị khác) */}
          <Route path="/managers" element={<ManagerList />} />

          {/* Quản lý Hợp đồng */}
          <Route path="/contracts" element={<ContractList />} />

          {/* Quản lý Trang thiết bị */}
          <Route path="/equipments" element={<EquipmentList />} />

          {/* Placeholder cho các trang sau */}
          <Route path="/settings" element={<div className="p-4">Cài đặt (Đang phát triển)</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
