#!/usr/bin/env node
/**
 * Read-only: ověří Google Calendar env (bez OAuth runtime call).
 *   npm run verify:google-calendar-config
 */
import { loadLocalEnv, envPresent, auditLine } from './audit-utils.mjs';

loadLocalEnv();

console.log('=== GOOGLE CALENDAR ===');

const clientId = envPresent('GOOGLE_CALENDAR_CLIENT_ID');
const clientSecret = envPresent('GOOGLE_CALENDAR_CLIENT_SECRET');
const trainerEmail = envPresent('TRAINER_EMAIL');

if (!clientId) auditLine('WARN', 'GOOGLE_CALENDAR_CLIENT_ID is missing');
else auditLine('PASS', 'GOOGLE_CALENDAR_CLIENT_ID is set');

if (!clientSecret) auditLine('WARN', 'GOOGLE_CALENDAR_CLIENT_SECRET is missing');
else auditLine('PASS', 'GOOGLE_CALENDAR_CLIENT_SECRET is set');

if (!trainerEmail) auditLine('WARN', 'TRAINER_EMAIL is missing');
else auditLine('PASS', 'TRAINER_EMAIL is set');

if (!clientId || !clientSecret) {
  auditLine('WARN', 'Google Calendar integration not fully configured');
  auditLine('WARN', 'OAuth token state cannot be verified without stored refresh token');
  process.exit(0);
}

auditLine('PASS', 'Google Calendar client credentials present');
auditLine('WARN', 'OAuth runtime not verified (refresh token not checked in read-only audit)');
process.exit(0);
