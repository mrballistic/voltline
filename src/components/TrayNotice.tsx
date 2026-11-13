import Typography from '@mui/material/Typography';
import { NEON } from '../theme';

export const TRAY_FULL = 'Tray full—spend one to free a slot.';

/** Persistent while the tray is full. The slot is always rendered (and its height reserved) so the live region announces and nothing shifts. */
export default function TrayNotice({ trayFull }: { trayFull: boolean }) {
  return (
    <Typography
      role="status"
      aria-live="polite"
      sx={{ minHeight: 24, textAlign: 'center', fontSize: 16, color: NEON.yellow, textShadow: `0 0 8px ${NEON.yellow}66` }}
    >
      {trayFull ? TRAY_FULL : ''}
    </Typography>
  );
}
