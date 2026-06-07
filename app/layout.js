import { Inter } from 'next/font/google';
import './globals.css';
import { NotificationProvider } from '@/lib/NotificationContext';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'YourCast | Real-Time Ad Boards',
  description: 'Turn every screen into a live opportunity. Real-time digital ad boards for fleets, retail stores, and events.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <NotificationProvider>
          {children}
        </NotificationProvider>
      </body>
    </html>
  );
}
