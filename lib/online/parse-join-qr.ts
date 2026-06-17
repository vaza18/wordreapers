import { isValidRoomCode, normalizeRoomCode } from '@/lib/firebase/room-code';

export interface JoinQrPayload {
  code: string;
  invitedBy?: string;
}

/**
 * Extract a room code from QR payload (raw code or join deep link URL).
 */
function isRawCodeInput(input: string): boolean {
  const normalized = input.toUpperCase().replace(/\s/g, '');
  return /^[2-9A-HJ-NP-Z]{4,6}$/.test(normalized);
}

export function parseJoinQrPayload(data: string): JoinQrPayload | null {
  const trimmed = data.trim();
  if (!trimmed) {
    return null;
  }

  const fromUrl = extractJoinFromUrl(trimmed);
  if (fromUrl) {
    return fromUrl;
  }

  const loose = trimmed.match(/[?&]code=([2-9A-HJ-NP-Z]{4,6})/i);
  if (loose?.[1]) {
    const normalized = normalizeRoomCode(loose[1]);
    if (isValidRoomCode(normalized)) {
      return { code: normalized };
    }
  }

  if (isRawCodeInput(trimmed)) {
    return { code: normalizeRoomCode(trimmed) };
  }

  return null;
}

export function parseRoomCodeFromQrPayload(data: string): string | null {
  return parseJoinQrPayload(data)?.code ?? null;
}

function extractJoinFromUrl(value: string): JoinQrPayload | null {
  try {
    const url = new URL(value);
    const code = url.searchParams.get('code');
    if (!code) {
      return null;
    }
    const normalized = normalizeRoomCode(code);
    if (!isValidRoomCode(normalized)) {
      return null;
    }
    const invitedBy = url.searchParams.get('invitedBy')?.trim();
    return invitedBy ? { code: normalized, invitedBy } : { code: normalized };
  } catch {
    return null;
  }
}
