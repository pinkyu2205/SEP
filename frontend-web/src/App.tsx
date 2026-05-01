import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AdminLayout } from './layouts/AdminLayout';
import { Dashboard } from './pages/dashboard/Dashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<Dashboard />} />
          {/* Các route sau sẽ được thêm vào đây */}
          <Route path="/properties" element={<div className="p-4">Quản lý Bất động sản (Đang phát triển)</div>} />
          <Route path="/tenants" element={<div className="p-4">Quản lý Khách thuê (Đang phát triển)</div>} />
          <Route path="/contracts" element={<div className="p-4">Quản lý Hợp đồng (Đang phát triển)</div>} />
          <Route path="/equipments" element={<div className="p-4">Quản lý Trang thiết bị (Đang phát triển)</div>} />
          <Route path="/settings" element={<div className="p-4">Cài đặt (Đang phát triển)</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
