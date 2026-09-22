/**
 * Authentication Service for SecondBrain Runtime.
 * Manages SMTP OTP requests, verification, and JWT session tokens.
 */

import { API_BASE_URL } from './apiClient';

export interface UserProfile {
  email: string;
  name?: string;
  role?: string;
}

export interface OTPRequestResponse {
  status: string;
  message: string;
  expires_in_seconds: number;
  resend_cooldown_seconds: number;
}

export interface OTPVerifyResponse {
  status: string;
  message: string;
  token: string;
  user: UserProfile;
}

const TOKEN_KEY = 'secondbrain_auth_token';

/**
 * Safely parses response body as text and then JSON if valid JSON exists.
 * Prevents "Unexpected end of JSON input" errors.
 */
async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: any = null;

  if (text && text.trim()) {
    try {
      json = JSON.parse(text);
    } catch {
      // Non-JSON response
    }
  }

  if (!res.ok) {
    const errorMsg =
      (json && (json.detail || json.message)) ||
      `HTTP ${res.status}: ${res.statusText || 'Request failed'}`;
    throw new Error(errorMsg);
  }

  if (json !== null) {
    return json as T;
  }

  throw new Error('Received invalid or empty response from authentication server.');
}

export const authService = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },

  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  },

  async requestOtp(email: string): Promise<OTPRequestResponse> {
    const url = `${API_BASE_URL}/api/v1/auth/request-otp`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    return await parseJsonResponse<OTPRequestResponse>(res);
  },

  async verifyOtp(email: string, otp: string): Promise<OTPVerifyResponse> {
    const url = `${API_BASE_URL}/api/v1/auth/verify-otp`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    });

    const data = await parseJsonResponse<OTPVerifyResponse>(res);
    if (data && data.token) {
      this.setToken(data.token);
    }
    return data;
  },

  async getCurrentUser(): Promise<UserProfile | null> {
    const token = this.getToken();
    if (!token) return null;

    try {
      const url = `${API_BASE_URL}/api/v1/auth/me`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        this.clearToken();
        return null;
      }

      const data = await parseJsonResponse<{ authenticated: boolean; user: UserProfile }>(res);
      return data.user;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      const url = `${API_BASE_URL}/api/v1/auth/logout`;
      await fetch(url, { method: 'POST' });
    } catch {
      // ignore network errors on logout
    } finally {
      this.clearToken();
    }
  },
};
