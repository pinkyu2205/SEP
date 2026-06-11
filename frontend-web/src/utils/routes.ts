// Tập trung khai báo đường dẫn để tránh hardcode rải rác và dễ refactor.

export const ROUTES = {
  // Public
  HOME: '/',
  PROPERTIES: '/properties',
  PROPERTY_DETAIL: '/properties/:id',
  SERVICES: '/services',
  CONTACT: '/contact',

  // Auth
  LOGIN: '/login',

  // Dashboard - Host
  HOST_ROOT: '/host',
  HOST_PROPERTIES: '/host/properties',

  // Dashboard - Admin
  ADMIN_ROOT: '/admin',
} as const;

/** Tạo đường dẫn chi tiết bất động sản công khai */
export const propertyDetailPath = (id: string) => `/properties/${id}`;

/** Đường dẫn mặc định sau khi đăng nhập theo vai trò */
export const DEFAULT_PATH_BY_ROLE = {
  admin: ROUTES.ADMIN_ROOT,
  host: ROUTES.HOST_ROOT,
} as const;
