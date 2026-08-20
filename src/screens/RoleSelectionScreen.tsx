import LoginScreen from '@/src/screens/LoginScreen';

/**
 * App entry welcome = branded login (username/password).
 * Sign up is a link on the form; role is chosen on the signup screen.
 */
export default function RoleSelectionScreen() {
  return <LoginScreen asWelcome />;
}
