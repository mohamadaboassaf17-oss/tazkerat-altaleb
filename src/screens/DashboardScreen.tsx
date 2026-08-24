import { Link } from 'react-router-dom';

export default function DashboardScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-neutral-50 px-4">
      <p className="text-neutral-600">شاشة لوحة التحكم — ستُبنى في الخطوة التالية</p>
      <Link
        className="rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-700"
        to="/categories"
      >
        تصنيفاتي
      </Link>
    </div>
  );
}
