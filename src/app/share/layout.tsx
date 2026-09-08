import type { Metadata } from 'next';
import Script from 'next/script';

export const metadata: Metadata = {
  title: 'suntv 分享播放',
  robots: { index: false, follow: false },
};

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Script src='/tanghulu-share.js' strategy='afterInteractive' />
      {children}
    </>
  );
}
