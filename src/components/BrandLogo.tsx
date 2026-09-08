import Link from 'next/link';

interface BrandLogoProps {
  className?: string;
  textClassName?: string;
}

const BrandLogo = ({
  className = '',
  textClassName = 'text-2xl',
}: BrandLogoProps) => {
  return (
    <Link
      href='/'
      className={`inline-flex items-center justify-center gap-1.5 select-none hover:opacity-80 transition-opacity duration-200 ${textClassName} ${className}`}
    >
      <img
        src='/logo.png'
        alt=''
        className='h-[1.35em] w-[1.35em] object-contain shrink-0'
      />
      <span className='font-bold text-[#FFC107] tracking-tight'>SunTV</span>
    </Link>
  );
};

export default BrandLogo;
