import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AdminLayout } from './layouts/AdminLayout';
import { Dashboard } from './pages/dashboard/Dashboard';
import { PropertyList } from './pages/properties/PropertyList';
import { PropertyDetail } from './pages/properties/PropertyDetail';
import { TenantList } from './pages/tenants/TenantList';

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

          {/* Placeholder cho các trang sau */}
          <Route path="/contracts" element={<div className="p-4">Quản lý Hợp đồng (Đang phát triển)</div>} />
          <Route path="/equipments" element={<div className="p-4">Quản lý Trang thiết bị (Đang phát triển)</div>} />
          <Route path="/settings" element={<div className="p-4">Cài đặt (Đang phát triển)</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
