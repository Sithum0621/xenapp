/**
 * App-wide flag: teacher attendance/payment SMS is off.
 * Push + in-app notifications still send. Edge `send-push-notification` also
 * requires SMS_NOTIFICATIONS_ENABLED=true to actually send SMS.
 */
export const SMS_NOTIFICATIONS_ENABLED = false;
