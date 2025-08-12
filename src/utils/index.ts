import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export function generateId(): string {
  return uuidv4();
}

export function generateCorrelationId(): string {
  return uuidv4();
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function formatCurrency(amount: number, currency: string): string {
  const formatters: { [key: string]: Intl.NumberFormat } = {
    KRW: new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }),
    USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
    PHP: new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }),
  };

  return formatters[currency]?.format(amount) || `${amount} ${currency}`;
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidEthereumAddress(address: string): boolean {
  const addressRegex = /^0x[a-fA-F0-9]{40}$/;
  return addressRegex.test(address);
}

export function calculateExpirationTime(minutes: number): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + minutes);
  return now.toISOString();
}

export function isExpired(expirationTime: string): boolean {
  return new Date() > new Date(expirationTime);
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function retryAsync<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const attempt = async (): Promise<void> => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        attempts++;
        if (attempts >= maxRetries) {
          reject(error);
        } else {
          setTimeout(attempt, delayMs * attempts);
        }
      }
    };

    attempt();
  });
}