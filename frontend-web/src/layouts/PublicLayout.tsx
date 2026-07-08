import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { PublicHeader } from '@/components/public/PublicHeader';
import { PublicFooter } from '@/components/public/PublicFooter';

/** Spinner toàn trang hiển thị khi lazy-load các trang public */
const PageFallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-primary-600" />
  </div>
);

/** Khung giao diện cho toàn bộ Public Website (Header + nội dung + Footer) */
export const PublicLayout = () => {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <PublicHeader />
      <main className="flex-1">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <PublicFooter />
    </div>
  );
};
