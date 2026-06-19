import { resolveGameSessionSettingsForSession } from '../firebase/session-settings.js';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/**
 * One-line lobby summary of round options (mockup screen 4).
 */
export function formatLobbySettingsLabel(
  t: TranslateFn,
  session: Parameters<typeof resolveGameSessionSettingsForSession>[0],
): string {
  const resolved = resolveGameSessionSettingsForSession(session);
  const minutes = Math.round(resolved.durationSeconds / 60);
  const uniqueBonus = resolved.uniqueBonusEnabled
    ? t('online.lobbyUniqueBonusOn')
    : t('online.lobbyUniqueBonusOff');
  const proper = resolved.allowProperNouns ? t('online.lobbyProperOn') : t('online.lobbyProperOff');
  const slang = resolved.allowSlang ? t('online.lobbySlangOn') : t('online.lobbySlangOff');

  return t('online.lobbySettingsSummary', {
    minutes,
    uniqueBonus,
    proper,
    slang,
  });
}
