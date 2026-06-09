import { useEffect, useRef, useState } from 'react';

interface RevealProps {
  children: React.ReactNode;
  /** Độ trễ animation (ms) để tạo hiệu ứng so le */
  delay?: number;
  className?: string;
}

/**
 * Bọc nội dung để tự động hiện dần (fade-up) khi cuộn vào viewport.
 * Dùng IntersectionObserver thuần, không cần thư viện ngoài.
 */
export const Reveal = ({ children, delay = 0, className = '' }: RevealProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};
